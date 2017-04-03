import * as Redis from 'ioredis';
import { AsapAction } from 'rxjs/scheduler/AsapAction';
import { AsapScheduler } from 'rxjs/scheduler/AsapScheduler';

import { AttributedModification, ModificationSource } from './blaze/modification';
import { TreeDatabase } from './blaze/tree-database';
import { Update } from './blaze/update';
import { Whiteboard } from './whiteboard/whiteboard';

const sessionToken = 's698D';

// setup db and whiteboard renderer
const blazeDb = new TreeDatabase(false, new AsapScheduler(AsapAction));
const whiteboard = new Whiteboard(blazeDb);

// subscribe to redis
const redis = new Redis({
    host: 'redis-test.1hawek.ng.0001.usw2.cache.amazonaws.com',
    port: 6379,
    db: 3
});

// process all incremental updates for a particular session so far
const key = `test:tutoring:session:${sessionToken}`;
redis.llen(key, (errA: object, count: number) => {
    return redis.lrangeBuffer(key, 1, count, (errB: object, res: Buffer[]) => record(res));
});

// main execution loop
function record(res: Buffer[]) {
    let prevTicks: number;

    // process each binary update
    res.forEach(binary => {
        // extract and deserialize the update from the binary data
        const update = JSON.parse(binary.slice(4, binary.length - 8).toString()) as Update;
        const modification: AttributedModification = {
            source: ModificationSource.Remote,
            modification: update.data
        };

        // use lower bytes of timestamp for diffing with prev timestamp;
        // this is to avoid having to operate on uint64, which JS doesn't support
        const bytes = binary.slice(binary.byteLength - 4);
        const ticks = bytes.readUInt32BE(0) / 10000; // convert from .net ticks to milliseconds

        // calculate the duration that has passed since the previous update (in milliseconds)
        const delta = prevTicks ? ticks - prevTicks : 0;
        prevTicks = ticks;

        // increment the whiteboard's clock
        whiteboard.addDelta(delta);

        // apply the update to the db
        blazeDb.modificationSink.next(modification);

        whiteboard.takeSnapshot();
    });
}
