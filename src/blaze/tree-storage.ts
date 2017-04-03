import 'rxjs/add/observable/from';
import 'rxjs/add/observable/fromPromise';
import 'rxjs/add/operator/finally';
import 'rxjs/add/operator/mergeMap';
import 'rxjs/add/operator/merge';

import { Observable } from 'rxjs/Observable';

import { Node, NodeEvent, PrimitiveValue } from './node';
import { TreeDataEventType } from './tree-data-event';

type NodePromiseCallback = (value: Node) => void;

/**
 * @class A tree like storage where any node can either be a leaf and contain value or have children.
 */
export class TreeStorage {
    static readonly PATH_SEPARATOR = '/';

    /**
     * @member root - the root node of the tree
     */
    readonly root = new Node(null, '');

    /**
     * @member pendingNodeCallbacks - maps all root node subpaths to an array of promise resolve
     * callbacks representing outstanding observables that are waiting for the node to become available
     */
    private pendingNodeCallbacks = new Map<string, NodePromiseCallback[]>();

    /**
     * @static Splits the path into an array of key substrings
     * @param path - the path string to be split
     * @returns array of key substrings
     */
    static split(path: string) {
        return path.split(TreeStorage.PATH_SEPARATOR);
    }

    /**
     * Returns the node located at the specified path
     * @param path - the path of the node to be returned
     * @returns the node, null otherwise
     */
    getNode(path: string): Node | null {
        if (path.length === 0) {
            return this.root;
        }

        const splitPath = TreeStorage.split(path);
        return this.root.getChild(splitPath);
    }

    // Returns both a promise and the callback for it's resolution; resolves with the
    // node for the path when it becomes available
    private getNodePromise(path: string) {
        let callback: NodePromiseCallback | null = null; // null if it's immediately resolved
        const promise = new Promise((resolve: (value: Node) => void) => {
            // check if the node currently exists -> resolve it
            const node = this.getNode(path);
            if (node) {
                resolve(node);
                return;
            }

            // map the callback
            const callbacks = this.pendingNodeCallbacks.get(path);
            if (callbacks) {
                callbacks.push(resolve);
            } else {
                this.pendingNodeCallbacks.set(path, [resolve]);
            }

            callback = resolve;
        });

        return { promise, callback };
    }

    // Removes the NodePromiseCallback mapped at path in pendingNodeCallbacks
    private cleanupNodePromise(path: string, callback: NodePromiseCallback | null) {
        // return if the resolve was never mapped
        if (callback === null) {
            return;
        }

        let callbacks = this.pendingNodeCallbacks.get(path);
        if (callbacks) {
            callbacks = callbacks.filter(cb => cb !== callback);
            callbacks.length > 0 ?
                this.pendingNodeCallbacks.set(path, callbacks) : this.pendingNodeCallbacks.delete(path);

        }
    }

    // Ensures that a node either exists or is created for every subpath; returns the final node
    private resolveNode(path: string) {
        const splitPath = TreeStorage.split(path);
        return this.root.resolveChild(splitPath);
    }

    // Called whenever a node is created, updated, or resolved; ensures that any
    // outstanding observables are properly subscribed to the node
    private onNodeModified(path: string) {
        let subpath = '';

        TreeStorage.split(path).forEach((key, idx) => {
            subpath += idx > 0 ? `${TreeStorage.PATH_SEPARATOR}${key}` : key;

            // obtain the node
            const node = this.getNode(subpath) as Node; // the node is assumed to exist

            // check for any outstanding observables, and resolve them
            const callbacks = this.pendingNodeCallbacks.get(subpath);
            if (callbacks) {
                callbacks.forEach(cb => cb(node));
                this.pendingNodeCallbacks.delete(subpath);
            }
        });
    }

    // Returns an observable of NodeEvents for the current state of a node
    private getStateObservable(node: Node) {
        const events: NodeEvent[] = [];

        node.getChildren().forEach((child: Node, key: string) => {
            events.push({ type: TreeDataEventType.ChildAdded, node: child });
        });
        events.push({ type: TreeDataEventType.ValueChanged, node });

        return Observable.from(events);
    }

    /**
     * Returns an observable for the given path; NodeEvents will not be
     * generated until the node comes into existence
     * @param path - the path of the node to be observed
     * @returns the Observable
     */
    observe(path: string): Observable<NodeEvent> {
        const { promise, callback } = this.getNodePromise(path);
        const nodeObs = Observable.fromPromise(promise);

        const state = nodeObs.mergeMap(node => this.getStateObservable(node));
        const changes = nodeObs.mergeMap(node => node.changes);

        return state.merge(changes).finally(() => this.cleanupNodePromise(path, callback));
    }

    /**
     * Sets a value at the specified path
     * @param path - the path of the node
     * @param value - the value to be set
     */
    setValue(path: string, value: PrimitiveValue): void {
        this.resolveNode(path).setValue(value);
        this.onNodeModified(path);
    }

    /**
     * Sets values at the specified path; will disconnect previous children
     * @param path - the path of the node
     * @param values - a dictionary of children to be created
     */
    setValues(path: string, values: {[key: string]: PrimitiveValue}): void {
        const node = this.resolveNode(path);

        node.removeAllChildren();
        Object.keys(values).forEach((key) => {
            const splitPath = TreeStorage.split(key);
            node.resolveChild(splitPath).setValue(values[key]);
        });

        Object.keys(values).forEach((key) => {
            this.onNodeModified(path.length > 0 ? `${path}${TreeStorage.PATH_SEPARATOR}${key}` : key);
        });

        this.onNodeModified(path);
    }

    /**
     * Updates the values at the specified path without overwriting other keys at this location
     * @param path - the path of the node
     * @param values - a dictionary of children to be updated
     */
    updateValues(path: string, values: {[key: string]: PrimitiveValue}): void {
        const node = this.resolveNode(path);

        Object.keys(values).forEach((key) => {
            const splitPath = TreeStorage.split(key);
            node.resolveChild(splitPath).setValue(values[key]);
        });

        Object.keys(values).forEach((key) => {
            this.onNodeModified(path.length > 0 ? `${path}${TreeStorage.PATH_SEPARATOR}${key}` : key);
        });

        this.onNodeModified(path);
    }

    /**
     * Removes the node at this location and all it's children
     * @param path - the path of the node
     */
    removeValue(path: string): void {
        const splitPath = TreeStorage.split(path);
        const key = splitPath.pop();

        const node = this.root.getChild(splitPath);
        if (node && key) {
            node.removeDirectChild(key);
        }
    }

    /**
     * Resets all recorded changes
     */
    resetRecordedChanges(): void {
        this.root.resetChangedNodes();
    }

    /**
     * Triggers notification callbacks for the nodes that have been affected by the recent operations
     */
    triggerRecordChangeNotifications(): void {
        this.root.fireChildrenNotifications();
    }
}
