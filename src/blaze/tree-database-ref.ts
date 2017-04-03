import 'rxjs/add/operator/filter';
import 'rxjs/add/operator/first';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/observeOn';

import { Observable } from 'rxjs/Observable';
import { Observer } from 'rxjs/Observer';

import { ModificationFactory } from './modification';
import { PrimitiveValue } from './node';
import { TreeDatabase } from './tree-database';
import { TreeDataEventType, TreeDataEvent } from './tree-data-event';
import { TreeDataSnapshot } from './tree-data-snapshot';
import { TreeStorage } from './tree-storage';

/**
 * @class Represents a location within the database. Allows for listening to
 * changes and writing to this location.
 */
export class TreeDatabaseRef {
    /**
     * @member database - the parent database
     */
    readonly database: TreeDatabase;

    /**
     * @member path - the path to this location within the parent database
     */
    readonly path: string;

    /**
     * @param db - the parent database
     * @param path - the path to this location within the parent database
     */
    constructor(db: TreeDatabase, path: string) {
        this.database = db;
        this.path = path;
    }

    /**
     * Creates a new reference to a child of this node with the specified relative path
     * @param path - relative path to the the child node
     * @returns a reference to the child
     */
    child(path: string): TreeDatabaseRef {
        return new TreeDatabaseRef(this.database, this.path + TreeStorage.PATH_SEPARATOR + path);
    }

    /**
     * Creates a new reference to a child location using a unique key (push id). This method is
     * useful when children of the location represent a list of items. The key is prefixed with
     * a client generated timestamp so that resulting list will be chronologically sorted.
     * @returns a reference to the child
     */
    childWithAutoId(): TreeDatabaseRef {
        const path = this.path + TreeStorage.PATH_SEPARATOR + this.database.pushIdGenerator.generate();
        return new TreeDatabaseRef(this.database, path);
    }

    /**
     * Returns an Observable which emits events whenever changes of one of the given types are
     * made to this location (or its children).
     * @param eventTypes - the types of events to listen to
     * @returns an Observable for this location
     */
    changes(eventTypes: Set<TreeDataEventType>): Observable<TreeDataEvent> {
        return Observable.create((observer: Observer<TreeDataEvent>) => {
            const observable = this.database.storage.observe(this.path);

            let res = observable
                .filter(e => eventTypes.has(e.type))
                .map(e => {
                    switch (e.type) {
                        case TreeDataEventType.ChildRemoved:
                            const node = e.node;
                            const path = this.path + TreeStorage.PATH_SEPARATOR + node.key;
                            const snapshot = new TreeDataSnapshot(this.database, node, path, node.key);
                            return new TreeDataEvent(TreeDataEventType.ChildRemoved, snapshot);
                        default:
                            return new TreeDataEvent(e.type, TreeDataSnapshot.take(this.database, e.node));
                    }
                });

            if (this.database.scheduler) {
                res = res.observeOn(this.database.scheduler);
            }

            res.subscribe(observer);
        });
    }

    /**
     * Sets the value at this location to be the given primitive value. Any
     * existing children will be removed (with ChildRemoved events generated).
     * @param value - the value to be set
     */
    setValue(value: PrimitiveValue): void {
        if (this.database.readonly) {
            throw new Error('Can\'t write to a readonly database');
        }

        this.database.storage.setValue(this.path, value);
        this.database.publisher.next(ModificationFactory.SetValue(this.path, value));
        this.database.storage.triggerRecordChangeNotifications();
    }

    /**
     * Creates children with subpaths equal to the keys in `values` and sets their values to
     * the corresponding values in `values`. The subpaths can be compound. Any existing
     * children will be removed (with ChildRemoved events generated).
     * @param values - a dictionary of children to be created
     */
    setValues(values: {[key: string]: PrimitiveValue}): void {
        if (this.database.readonly) {
            throw new Error('Can\'t write to a readonly database');
        }

        this.database.storage.setValues(this.path, values);
        this.database.publisher.next(ModificationFactory.SetValues(this.path, values));
        this.database.storage.triggerRecordChangeNotifications();
    }

    /**
     * Updates children at subpaths equal to the kyes in `values` to the corresponding values in
     * `values`. The subpaths can be compound. Existing children  of this location not mentioned in
     * `values` will be untouched.
     * @param values - a dictionary of children to be updated
     */
    update(values: {[key: string]: PrimitiveValue}): void {
        if (this.database.readonly) {
            throw new Error('Can\'t write to a readonly database');
        }

        this.database.storage.updateValues(this.path, values);
        this.database.publisher.next(ModificationFactory.Update(this.path, values));
        this.database.storage.triggerRecordChangeNotifications();
    }

    /**
     * Removes this location from the tree database. Any Observables returned by `changes()` calls
     * to this location, or any of its children, will be completed.
     */
    remove(): void {
        if (this.database.readonly) {
            throw new Error('Can\'t write to a readonly database');
        }

        this.database.storage.removeValue(this.path);
        this.database.publisher.next(ModificationFactory.Remove(this.path));
        this.database.storage.triggerRecordChangeNotifications();
    }

    /**
     * Returns a Promise that resolves to the current value of the node, or an
     * intial value when it comes into existenceo
     * @returns an Promise for the intial value
     */
    getValue() {
        return new Promise((resolve, reject) => {
            const obs = this.changes(new Set([TreeDataEventType.ValueChanged]))
                            .first();

            obs.subscribe({
                next: (event) => resolve(event.value.toJSON()),
                error: () => reject
            });
        });
    }
}
