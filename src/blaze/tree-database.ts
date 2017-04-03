import { Observable } from 'rxjs/Observable';
import { Subscriber } from 'rxjs/Subscriber';
import { Scheduler } from 'rxjs/Scheduler';
import { Subject } from 'rxjs/Subject';

import { Database, DatabaseImplementor } from './database';
import { AttributedModification, Modification, ModificationType, ModificationSource,
         SetValue, SetValues, Update } from './modification';
import { PushIdGenerator } from './push-id-generator';
import { TreeDatabaseRef } from './tree-database-ref';
import { TreeStorage } from './tree-storage';

/**
 * @class Firebase-like database of Nodes, stored and managed by the TreeStorage
 */
export class TreeDatabase implements Database, DatabaseImplementor {
    /**
     * @member readonly - whether or not this Database can be modified
     */
    readonly readonly: boolean;

    /**
     * @member scheduler - scheduler that is used for sending notifications via TreeDatabaseRef.changes()
     */
    readonly scheduler: Scheduler | null;

    /**
     * @member storage - TreeStorage object used for storing Nodes
     */
    readonly storage = new TreeStorage();

    /**
     * @member pushIdGenerator - generator for unique Node keys
     */
    readonly pushIdGenerator = new PushIdGenerator();

    /**
     * @member modifications -  exposes an observable for local modifications
     */
    get modifications(): Observable<Modification> {
        return this.publisher.asObservable();
    }

    /**
     * @member modificationSink -  exposes a subscriber for receiving remote modifications to be applied
     */
    get modificationSink(): Subscriber<AttributedModification> {
        return this.subscriber;
    }

    readonly publisher = new Subject<Modification>();
    private subscriber = new Subscriber<AttributedModification>({
        next: this.applyModification.bind(this)
    });

    /**
     * @param readonly - whether or not this Database can be modified
     * @param scheduler - the scheduler to be used
     */
    constructor(readonly: boolean,
                scheduler: Scheduler | null = null
    ) {
        this.readonly = readonly;
        this.scheduler = scheduler;
    }

    /**
     * Creates a reference to a node in the tree at the specific path
     * @param path - the path to the node from the root
     * @returns a new reference
     */
    reference(path: string): TreeDatabaseRef {
        return new TreeDatabaseRef(this, path);
    }

    // Applies all remote updates received via the modificationSink to storage
    private applyModification(change: AttributedModification) {
        // notifications that have originated locally have most likely already been recorded;
        // to avoid duplicate notifications, we suppress some
        let suppressNotifications = false;
        const isLocal = change.source === ModificationSource.Local;

        const m = change.modification;
        switch (m.type) {
            case ModificationType.SetValue:
                this.storage.setValue(m.path, (m as SetValue).value);
                break;
            case ModificationType.SetValues:
                const node = this.storage.getNode(m.path);
                const clone = isLocal ? (node ? node.clone() : null) : null;
                this.storage.setValues(m.path, (m as SetValues).values);

                suppressNotifications = isLocal && clone !== null && clone.isEqual(this.storage.getNode(m.path));
                break;
            case ModificationType.Update:
                this.storage.updateValues(m.path, (m as Update).values);
                break;
            case ModificationType.Remove:
                this.storage.removeValue(m.path);
                break;
            default:
                break;
        }

        if (!suppressNotifications) {
            this.storage.triggerRecordChangeNotifications();
        } else {
            this.storage.resetRecordedChanges();
        }
    }
}
