import * as Fabric from 'fabric';
const fabric = (Fabric as any).fabric as typeof Fabric;
import { Canvas } from 'fabric';
const { createCanvasForNode } = fabric;
import { createWriteStream } from 'fs';
import { Subscription } from 'rxjs/Subscription';

import { TreeDatabase } from '../blaze/tree-database';
import { TreeDataEventType } from '../blaze/tree-data-event';

export class Whiteboard {
    private blazeDb: TreeDatabase;
    private subscription = new Subscription();

    private canvas: Canvas;

    private clock = 0;
    private timeOfLastSnapshot = 0;

    private snapshotIdx = 0;
    private fileCount = 0;

    constructor(blazeDb: TreeDatabase) {
        this.blazeDb = blazeDb;

        this.canvas = createCanvasForNode(10, 10); // TODO: change back to 0, 0
        // TODO: reset to white background & take composites
        this.canvas.setBackgroundColor('rgba(255, 100, 100, 1.0)', () => this.canvas.renderAll());

        this.subscribe();
    }

    addDelta(delta: number) {
        this.clock += delta;
    }

    takeSnapshot() {
        return new Promise((resolve) => {
            // TODO: diff clock and timeOfLastSnapshot to get the file duration
            console.log(`taking snapshot ${this.snapshotIdx + 1}`);

            const file = createWriteStream(`/Users/tommy/Documents/session-recorder/snapshots/${++this.snapshotIdx}.png`);
            const stream = (this.canvas as any).createPNGStream();

            stream.on('data', (chunk: any) => file.write(chunk));

            stream.on('end', () => {
                this.fileCount++;
                resolve();
            });
        });
    }

    private subscribe() {
        this.subscription.add(
            this.blazeDb.reference('whiteboard/canvasWidth')
                .changes(new Set([TreeDataEventType.ValueChanged]))
                .map(ev => ev.value.value as number)
                .subscribe(width => this.canvas.setWidth(width))
        );

        this.subscription.add(
            this.blazeDb.reference('whiteboard/canvasHeight')
                .changes(new Set([TreeDataEventType.ValueChanged]))
                .map(ev => ev.value.value as number)
                .subscribe(height => this.canvas.setHeight(height))
        );
    }
}
