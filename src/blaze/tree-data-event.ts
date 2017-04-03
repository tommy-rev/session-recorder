import { TreeDataSnapshot } from './tree-data-snapshot';

/**
 * @enum Describes the types of events that can be tracked
 */
export enum TreeDataEventType {
    // A new child is added to the node
    ChildAdded,

    // A child is removed from the node
    ChildRemoved,

    // A child of the node has been changed
    ChildChanged,

    // The value of this node has changed
    ValueChanged
}

/**
 * @class Represents an incremental change to a Node, and the resulting snapshot
 */
export class TreeDataEvent {
    /**
     * @member type - the type of the event
     */
    readonly type: TreeDataEventType;

    /**
     * @member value - Snapshot for the node that is affected. For the removed node, only
     * the path and key of the node is available; the value of the node will be erased
     */
    readonly value: TreeDataSnapshot;

    /**
     * @param type - the type of the event
     * @param value - resulting snapshot
     */
    constructor(
        type: TreeDataEventType,
        value: TreeDataSnapshot
    ) {
        this.type = type;
        this.value = value;
    }
}
