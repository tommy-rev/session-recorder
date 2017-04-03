import { Observable } from 'rxjs/Observable';
import { Scheduler } from 'rxjs/Scheduler';
import { Subject } from 'rxjs/Subject';

import { Modification } from './modification';
import { PushIdGenerator } from './push-id-generator';
import { TreeStorage } from './tree-storage';

export interface Database {
    readonly readonly: boolean;
    readonly publisher: Subject<Modification>;
    readonly modifications: Observable<Modification>;
}

export interface DatabaseImplementor {
    readonly scheduler: Scheduler | null;
    readonly storage: TreeStorage;
    readonly pushIdGenerator: PushIdGenerator;
}
