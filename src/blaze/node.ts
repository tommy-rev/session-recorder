import { Observable } from 'rxjs/Observable';
import { Subject } from 'rxjs/Subject';

import { ChangeType } from './change-type';
import { TreeDataEventType } from './tree-data-event';

export type PrimitiveValue = boolean | number | string;

/**
 * @interface Object representing an incremental change to a Node
 */
export interface NodeEvent {
    type: TreeDataEventType;
    node: Node;
}

export interface JsonValue {
    [key: string]: PrimitiveValue | JsonValue;
}

/**
 * @class Represents a single node within TreeStorage; it's value can take on that of
 *      either a PrimitiveValue or a dictionary of children nodes
 */
export class Node {
    /**
     * @member parent - parent of this node, null for the root node
     */
    readonly parent: Node | null;

    /**
     * @member key - name of this node among it's parent's children
     */
    readonly key: string;

    private _value: PrimitiveValue | null = null;

    /**
     * @member value - PrimitiveValue for the node; null if children are active instead
     */
    get value(): PrimitiveValue | null { return this._value; }

    private setValueInternal(newValue: PrimitiveValue | null) {
        if (newValue) {
            this.removeAllChildren();
        }

        this._value = newValue;
    }

    // Children of this node, mapping from name to the corresponding child
    private children = new Map<string, Node>();

    // The nodes that have been changed recently
    private changedNodes = new Map<string, ChangeType>();

    // Publisher that the events are published through and can be subscribed to
    private publisher = new Subject<NodeEvent>();

    /**
     * @member changes - observable that should be used to subscribe to events from this node
     */
    get changes(): Observable<NodeEvent> {
        return this.publisher.asObservable();
    }

    /**
     * @member pathFromRoot - full name of this node as an array of node names from
     *      the root (excluding the root node)
     */
    get pathFromRoot(): string[] {
        if (this.parent) {
            const path = this.parent.pathFromRoot;
            path.push(this.key);
            return path;
        } else {
            // the root node is not added to the full name
            return [];
        }
    }

    /**
     * @param parent - the parent node that possesses this new node as a child
     * @param key - key identifier for this node
     */
    constructor(parent: Node | null, key: string) {
        this.parent = parent;
        this.key = key;
    }

    /**
     * Returns a direct child of this node with the specified key
     * @param key - the key of the desired child Node
     * @returns the child node, or undefined otherwise
     */
    getDirectChild(key: string): Node | undefined {
        return this.children.get(key);
    }

    /**
     * Find a child by the specified path. If any of the path nodes don't exist, returns null
     * @param path - array of subsequent child keys
     * @returns the child node, or null otherwise
     */
    getChild(path: string[]): Node | null {
        if (path.length === 0 || path[0] === '') {
            return this;
        }

        path = path.slice();

        const key = path.shift() as string;
        const node = this.getDirectChild(key);

        return node ? node.getChild(path) : null;
    }

    /**
     * Returns a Map of all children Nodes, mapped by their key
     * @returns the child Map
     */
    getChildren(): Map<string, Node> {
        return new Map(this.children);
    }

    /**
     * Sets the primitive value for this node; will notify the parent that this node has
     * changed if the value being set is different from what was set before
     * @param value - the value to be set
     * @returns whether the new value is the same as the previous value
     */
    setValue(value: PrimitiveValue): boolean {
        if (value === this.value) {
            return false;
        }

        this.setValueInternal(value);

        if (this.parent) {
            this.parent.markChildAsChanged(this.key, ChangeType.Changed);
        }

        return true;
    }

    /**
     * Sets the value to null and adds a new direct child of this node; a previously existing
     * child node with the same name will be overwritten
     * @param key - the key for the new child to be created
     * @returns the new child Node
     */
    setDirectChild(key: string): Node {
        if (this.value) {
            this.setValueInternal(null);
        }

        // disconnect the previous node if it exists
        let node = this.getDirectChild(key);
        const changeType = node ? ChangeType.Changed : ChangeType.Added;
        if (node) {
            node.disconnect();
        }

        // create the new node and map it
        node = new Node(this, key);
        this.children.set(key, node);
        this.markChildAsChanged(key, changeType);

        return node;
    }

    /**
     * Goes through the specified path and makes sure that a node for each path element exists; will
     * create it if it doesn't. Returns the final node in the path
     * @param path - array of subsequent child keys
     * @returns the new child Node
     */
    resolveChild(path: string[]): Node {
        if (path.length === 0 || path[0] === '') {
            return this;
        } else if (this.value) {
            this.setValueInternal(null);
        }

        path = path.slice();

        const key = path.shift() as string;
        const node = this.resolveDirectChild(key);

        return node.resolveChild(path);
    }

    /**
     * Finds and returns a direct child of this node with the specified name, if no child with this
     * name currently exists, a new node will be created
     * @param key - the key for the new child to be resolved
     * @returns the new child Node
     */
    resolveDirectChild(key: string): Node {
        let node = this.getDirectChild(key);
        if (node) {
            return node;
        }

        node = new Node(this, key);
        this.children.set(key, node);
        this.markChildAsChanged(key, ChangeType.Added);

        return node;
    }

    /**
     * Removes and disconnects a direct child of this node
     * @param key - the key for the child to be removed
     */
    removeDirectChild(key: string): void {
        const node = this.getDirectChild(key);
        if (!node) {
            return;
        }

        this.markChildAsChanged(key, ChangeType.Removed);
        node.disconnect();
        this.children.delete(key);
    }

    /**
     * Removes all children nodes of this node, typically should be followed by
     * setting a value or new children
     */
    removeAllChildren(): void {
        this.children.forEach((node: Node, key: string) => {
            this.markChildAsChanged(key, ChangeType.Removed);
            node.disconnect();
        });

        this.children.clear();
    }

    /**
     * Marks this node and all its children as disconnected (i.e. removed) from the tree
     */
    disconnect(): void {
        this.children.forEach((node: Node) => node.disconnect());
        this.publisher.complete();
    }

    // Marks the specified child subnode as modified with the specified modification type. The
    // call propagates to the parent of this node to mark this node as changed there
    private markChildAsChanged(key: string, type: ChangeType) {
        if (!this.children.has(key)) {
            throw new Error(`Child node ${key} does not exist for ${this.key}`);
        }

        const currentType = this.changedNodes.get(key);
        if (currentType !== undefined) {
            if (currentType === ChangeType.Changed && type === ChangeType.Changed) {
                // no-op
                return;
            } else if (currentType === ChangeType.Removed && type === ChangeType.Added) {
                this.changedNodes.set(key, ChangeType.Changed);
                return;
            } else if (currentType === ChangeType.Added && type === ChangeType.Removed) {
                this.changedNodes.delete(key);
                return;
            } else if (currentType === ChangeType.Added && type === ChangeType.Changed) {
                this.changedNodes.set(key, ChangeType.Added);
                return;
            } else {
                this.changedNodes.set(key, type);
                return;
            }
        } else {
            this.changedNodes.set(key, type);

            if (this.parent && this.changedNodes.size === 1) {
                this.parent.markChildAsChanged(this.key, ChangeType.Changed);
            }
        }
    }

    /**
     * Resets all recorded changes
     */
    resetChangedNodes(): void {
        this.changedNodes.forEach((type: ChangeType, key: string) => {
            if (type !== ChangeType.Removed) {
                const node = this.getDirectChild(key);
                if (!node) {
                    throw new Error(`Child node ${key} does not exist for ${this.key}`);
                }

                node.resetChangedNodes();
            }
        });

        this.changedNodes.clear();
    }

    /**
     * Publishes a ValueChanged event
     */
    fireSelfNotifications(): void {
        this.publisher.next({ type: TreeDataEventType.ValueChanged, node: this });
    }

    /**
     * Publishes an event for each child added, changed, or removed
     */
    fireChildrenNotifications(): void {
        this.changedNodes.forEach((type: ChangeType, key: string) => {
            let node = this.getDirectChild(key) as Node;
            if (type !== ChangeType.Removed && !node) {
                throw new Error(`Child node ${key} does not exist for ${this.key}`);
            }

            switch (type) {
                case ChangeType.Added:
                    this.publisher.next({ type: TreeDataEventType.ChildAdded, node });
                    break;
                case ChangeType.Changed:
                    this.publisher.next({ type: TreeDataEventType.ChildChanged, node });
                    break;
                case ChangeType.Removed:
                    node = new Node(null, key);
                    this.publisher.next({ type: TreeDataEventType.ChildRemoved, node });
                    break;
                default:
                    break;
            }

            if (type !== ChangeType.Removed) {
                node.fireChildrenNotifications();
                node.fireSelfNotifications();
            }
        });

        if (!this.parent && this.changedNodes.size > 0) {
            this.fireSelfNotifications();
        }

        this.changedNodes.clear();
    }

    /**
     * Creates a copy of this node and all children, with changes and publisher reset
     * @param parent - the node to be cloned
     * @returns the newly cloned node
     */
    clone(parent: Node | null = null): Node {
        const res = new Node(parent, this.key);

        res.setValueInternal(this.value);
        this.children.forEach((node: Node, key: string) => {
            res.children.set(key, node.clone(res));
        });

        return res;
    }

    /**
     * Determines equality with another node
     * @param parent - the node to be compared to
     * @returns whether the nodes are equivalent
     */
    isEqual(other: Node | null): boolean {
        if (!other || this.value !== other.value) {
            return false;
        }

        if (this.children.size !== other.children.size) {
            return false;
        }

        let hasEqualChildren = true;
        this.children.forEach((child: Node, key: string) => {
            const otherChild = other.getDirectChild(key);
            if (!otherChild || !child.isEqual(otherChild)) {
                hasEqualChildren = false;
                return;
            }
        });

        return hasEqualChildren;
    }

    /**
     * Traverses the node to create and return a JSON object representation of it's value
     * @returns a PrimitiveValue if the node has no children, otherwise a JsonValue
     */
    toJSON(): PrimitiveValue | JsonValue {
        if (this.value !== null) {
            return this.value;
        }

        const value: JsonValue = {};
        this.getChildren().forEach((child: Node) => {
            value[child.key] = child.toJSON();
        });

        return value;
    }
}
