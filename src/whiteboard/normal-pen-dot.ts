import * as Fabric from 'fabric';
const fabric = (Fabric as any).fabric as typeof Fabric;

export class NormalPenDot extends fabric.Circle {
    type: 'normal-pen-dot';

    constructor(center: any, options: any) {
        options = options || {};

        options.radius = options.strokeWidth / 2;
        options.originX = 'center';
        options.originY = 'center';
        options.left = center[0] || center.x;
        options.top = center[1] || center.y;
        options.fill = options.color;

        super(options);
    }
}
