import { Node, PrimitiveValue } from './node';
import { TreeDatabase } from './tree-database';
import { TreeDatabaseRef } from './tree-database-ref';
import { TreeStorage } from './tree-storage';

/**
 * @class Represents an immutable snapshot of the contents of a location in the
 * TreeDatabase at a particular point in time. This captures the values at all nodes in
 * the subtree rooted at this location.
 */
export class TreeDataSnapshot {
    /**
     * @member database - reference to the parent database that the snapshot belongs to
     */
    private database: TreeDatabase;

    /**
     * @member node - copy of the node in question
     */
    readonly node: Node;

    /**
     * @member path - path to the node from the root
     */
    readonly path: string;

    /**
     * @member key - name of this node among it's parent's children
     */
    readonly key: string;

    constructor(database: TreeDatabase,
                node: Node,
                path: string,
                key: string
    ) {
        this.database = database;
        this.node = node;
        this.path = path;
        this.key = key;
    }

    /**
     * @static Creates a snapshot based on the provided original node; the node will be cloned
     * @param database - the database that the node belongs to
     * @param node - the node to be cloned
     * @returns a reference to the newly cloned node
     */
    static take(database: TreeDatabase, node: Node): TreeDataSnapshot {
        const path = node.pathFromRoot.join(TreeStorage.PATH_SEPARATOR);
        return new TreeDataSnapshot(database, node.clone(), path, node.key);
    }

    /**
     * @member value - The PrimitiveValue at the location, if the location is a leaf node.
     * Will be null if this node has children.
     */
    get value(): PrimitiveValue | null {
        return this.node.value;
    }

    /**
     * @member children - The snapshots for the immediate children at this location. Will be
     * an empty array if the location is a leaf node
     */
    get children(): TreeDataSnapshot[] {
        const children: TreeDataSnapshot[] = [];

        this.node.getChildren().forEach((child: Node) => {
            const path = this.path + TreeStorage.PATH_SEPARATOR + child.key;
            children.push(new TreeDataSnapshot(this.database, child, path, child.key));
        });

        return children;
    }

    /**
     * @member ref - The location in the tree database at which this snapshot was taken
     */
    get ref(): TreeDatabaseRef {
        return new TreeDatabaseRef(this.database, this.path);
    }

    /**
     * @param path - relative path to the the child node
     * @returns whether the snapshot has a child with given path
     */
    hasChild(path: string): boolean {
        return this.node.getChild(TreeStorage.split(path)) !== null;
    }

    /**
     * Returns this child snapshot with given path within this snapshot, or no child with that path.
     * @param path - relative path to the the child node
     * @returns a snapshot of the child, or null otherwise
     */
    child(path: string): TreeDataSnapshot | null {
        const node = this.node.getChild(TreeStorage.split(path));

        if (node) {
            const childPath = this.path + TreeStorage.PATH_SEPARATOR + path;
            return new TreeDataSnapshot(this.database, node, childPath, node.key);
        } else {
            return null;
        }
    }

    /**
     * Determines equality with another snapshot (i.e. if all the nodes in the subtree have the same values)
     * @param other - the snapshot to be compared to
     * @returns whether the snapshots are equivalent
     */
    isEqual(other: TreeDataSnapshot): boolean {
        return this.node.isEqual(other.node);
    }

    toJSON() {
        return this.node.toJSON();
    }
}
