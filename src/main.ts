import * as Redis from 'ioredis';

import { AttributedModification, ModificationSource } from './blaze/modification';
import { TreeDatabase } from './blaze/tree-database';
import { Update } from './blaze/update';
import { Whiteboard } from './whiteboard/whiteboard';

const sessionToken = 's6A07';

// setup db and whiteboard renderer
const blazeDb = new TreeDatabase(false);
const whiteboard = new Whiteboard(blazeDb);

// connect to redis
const redis = new Redis({
    host: 'redis-test.1hawek.ng.0001.usw2.cache.amazonaws.com',
    port: 6379,
    db: 3
});

// process all incremental updates so far for a particular session
const key = `test:tutoring:session:${sessionToken}`;
redis.llen(key, (errA: object, count: number) => {
    return redis.lrangeBuffer(key, 1, count, (errB: object, res: Buffer[]) => record(res));
});

// main execution loop
async function record(res: Buffer[]) {
    let prevTicks = 0;

    // process each binary update
    for (const binary of res) {
        // extract and deserialize the update from the binary data
        const update = JSON.parse(binary.slice(4, binary.length - 8).toString()) as Update;
        const modification: AttributedModification = {
            source: ModificationSource.Remote,
            modification: update.data
        };

        // use lower bytes of timestamp for diffing with prev timestamp;
        // this is to avoid having to operate on uint64, which JS doesn't support
        // TODO: handle the case of overflow
        const bytes = binary.slice(binary.byteLength - 4);
        const ticks = bytes.readUInt32BE(0) / 10000; // convert from .net ticks to milliseconds

        // calculate the duration that has passed since the previous update (in milliseconds)
        const delta = prevTicks ? ticks - prevTicks : 0;
        prevTicks = ticks;

        // increment the whiteboard's clock
        whiteboard.addDelta(delta);

        // apply the update to the db
        blazeDb.modificationSink.next(modification);

        await whiteboard.takeSnapshot();
    }

    // TODO: get the snapshot filenames, and pipe them to FFMPEG

    console.log('success!');
    process.exit(0);
}
