import * as Fabric from 'fabric';
const fabric = (Fabric as any).fabric as typeof Fabric;
import { Canvas } from 'fabric';
const { createCanvasForNode } = fabric;

import { createReadStream, createWriteStream } from 'fs';
import { Subscription } from 'rxjs/Subscription';

import { PathInfo, PathFactory } from './path-factory';
import { TreeDatabase } from '../blaze/tree-database';
import { TreeDataEventType } from '../blaze/tree-data-event';

type WhiteboardInfo = {
    canvasWidth: number;
    canvasHeight: number;
};

type MemberInfo = {
    audioStatus: number;
};

export class Whiteboard {
    readonly basePath = '/Users/tommy/Documents/session-recorder/snapshots';

    private blazeDb: TreeDatabase;
    private subscription = new Subscription();

    private canvas: Canvas;
    private isDirty = false;

    private audioReadyCount = 0;

    private isStarted = false;
    private clock = 0;
    private timeOfLastSnapshot = 0;

    private snapshotIdx = 0;

    constructor(blazeDb: TreeDatabase) {
        this.blazeDb = blazeDb;

        this.canvas = createCanvasForNode(0, 0);
        this.canvas.setBackgroundColor('rgba(255, 255, 255, 1.0)', () => this.canvas.renderAll());

        this.subscribe();
    }

    addDelta(delta: number) {
        // only move the clock forward once the session has started
        if (!this.isStarted) {
            return;
        }

        this.clock += delta;
    }

    takeSnapshot() {
        return new Promise(async (resolve) => {
            // only take a snapshot if the whiteboard has recently been changed
            if (!this.isDirty) {
                resolve();
                return;
            }

            const duration = Math.round(this.clock - this.timeOfLastSnapshot);
            const snapshotCount =  Math.round(duration / ((1 / 60) * 1000));
            for (let i = 0; i < snapshotCount - 1; ++i) {
                await Whiteboard.copyFile(`${this.basePath}/${this.snapshotIdx}.png`, `${this.basePath}/${++this.snapshotIdx}.png`);
            }

            const file = createWriteStream(`${this.basePath}/${++this.snapshotIdx}.png`);
            const stream = (this.canvas as any).createPNGStream();

            stream.on('data', (chunk: any) => file.write(chunk));
            stream.on('end', () => file.end());

            file.on('close', () => resolve());

            // reset to clean
            this.isDirty = false;
            this.timeOfLastSnapshot = this.clock;
        });
    }

    private static copyFile(src: string, dst: string) {
        return new Promise((resolve) => {
            const stream = createReadStream(src);
            stream.on('end', () => resolve());

            stream.pipe(createWriteStream(dst));
        });
    }

    private subscribe() {
        this.subscription.add(
            this.blazeDb.reference('whiteboard')
                .changes(new Set([TreeDataEventType.ValueChanged]))
                .map(ev => ev.value.toJSON() as WhiteboardInfo)
                .subscribe(info => {
                    this.canvas.setWidth(info.canvasWidth);
                    this.canvas.setHeight(info.canvasHeight);
                    this.isDirty = true;
                })
        );

        this.subscription.add(
            this.blazeDb.reference('session/members')
                .changes(new Set([TreeDataEventType.ChildChanged]))
                .map(ev => ev.value.toJSON() as MemberInfo)
                .subscribe(info => {
                    if (!this.isStarted && info.audioStatus === 2 && ++this.audioReadyCount === 1) {
                        this.isStarted = true;
                    }
                })
        );

        // only listen to the first page of paths for now
        this.subscription.add(
            this.blazeDb.reference('drawablesData')
                .changes(new Set([TreeDataEventType.ChildChanged]))
                .map(ev => {
                    const json = ev.value.toJSON() as { [key: string]: any };
                    const drawableIds = Object.keys(json);
                    return json[drawableIds.pop()!] as PathInfo;
                })
                .filter(p => p.d3 !== undefined)
                .subscribe(p => {
                    const path = PathFactory.parsePath(p);
                    this.canvas.add(path as any);
                    this.isDirty = true;
                })
        );
    }
}
