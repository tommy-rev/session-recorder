import * as Fabric from 'fabric';
const fabric = (Fabric as any).fabric as typeof Fabric;

export class NormalPenPath extends ((fabric as any).Path as FunctionConstructor) {
    type: 'normal-pen-path';

    constructor(path: any, options: any) {
        options = options || {};

        options.fill = null;
        options.originX = 'center';
        options.originY = 'center';
        options.stroke = options.color;
        options.strokeLineCap = 'round';
        options.strokeLineJoin = 'round';

        super(path, options);
    }
}
