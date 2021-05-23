import SseTool from "./SseTool";
import Paper from "paper";
import { MeshToonMaterial } from "three";
import { ColorTransformFilter } from "canvas-filters";

export default class SseAiIOGTool extends SseTool {

    constructor(editor) {
        super(editor);
        this.bbox = null; // The bounding box provide bg info
        this.phase = 0; // 0 init, 1 drawing, 2 bbox done, 3 inside point.
        this.points = [];
        
        this.editingPoint = null; // The second point for defining a rectangle
        this.isDrawing = null; // True if a polygon is being created
        this.snapOther = null; // True if the mouse snap something but the first point of the polygon being created
        this.editingFeature = null; // Plain object to store the new polygon attributes
        this.minDistance = 0;
        this.cursor = "crosshair";
        this.bindCallbacks();
    }

    cancel() {
        // phase 1, didn't start, 
        if (this.phase == 0) {
            return;
        }
        // phase 2, first point in bbox selected 
        else if (this.phase == 1) {
            this.bbox.remove();
            this.bbox = null;
            this.points = [];
            this.phase = 0;
        }
        else if (this.phase == 2) {
            this.points[0].pop();
            this.phase = 1;
        }
    }

    onKeyDown(event) {
        if (event.key == 'escape') {
            this.cancel();
            event.preventDefault();
        }
    }

    onMouseMove(event) {
        this.editor.zoomPoint = event.point;
        let point = this.editor.keepPointInsideRaster(event.point);
        let localPoint = this.editor.rasterLayer.globalToLocal(point);

        this.editor.auxiliaryLine(localPoint);

        if (this.bbox && this.phase < 2) {
            this.bbox.segments[1].point.x = localPoint.x;
            this.bbox.segments[2].point.x = localPoint.x;
            this.bbox.segments[2].point.y = localPoint.y;
            this.bbox.segments[3].point.y = localPoint.y;
        }
        if (this.bbox && this.bbox.lastSegment) {
            this.editor.pendingSegment = this.bbox.lastSegment;
        }
    }

    onMouseDrag(event) {
        if (!this.isLeftButton(event) || event.modifiers.space)
            return super.viewDrag(event);
    }

    onMouseUp(event) {
        if (!this.isLeftButton(event) || event.modifiers.space)
            return super.viewUp(event);
    }

    finish() {
        Meteor.call('clearMask', this.editor.props.imageUrl);
        Meteor.call('savePoint', this.points, this.editor.props.imageUrl, "bgP_fgP");
        
        this.reset();
        
        this.editor.loadMask(this.editor.loadMaskFunc);
        // this.editor.set2Superpixel();
    }

    reset() {
        this.phase = 0;
        this.bbox.remove();
        this.points = [];
    }

    onMouseDown(event) {
        if (!this.isLeftButton(event) || event.modifiers.space)
            return super.viewDown(event);
        const point = this.editor.rasterLayer.globalToLocal(this.editor.keepPointInsideRaster(event.point));

        if (this.phase == 0) {
            this.editor.frontLayer.activate();

            // First point of the rectangle
            this.editingFeature = {classIndex: this.editor.activeClassIndex, polygon: []};
            this.bbox = new Paper.Path();
            this.editor.initPathProperties(this.bbox);
            this.bbox.fullySelected = true;
            this.editor.setColor(this.bbox, this.editor.activeColor);

            this.bbox.add(point);
            this.bbox.add(point);
            this.bbox.add(point);
            this.bbox.add(point);
            this.bbox.closed = true;

            this.points.push([[point.x, point.y]]);

            this.phase = 1;
        }
        else if (this.phase == 1) {
            // this.endRectangle();
            this.points[0].push([point.x, point.y]);

            this.phase = 2;
        } 
        else if (this.phase == 2) {
            this.points[0].push([point.x, point.y]);

            this.finish();
            event.preventDefault();
        }
    }

    endRectangle() {
        this.editor.setActualSelectionAsync([this.bbox]);
        //this.bbox.fullySelected = false;
        this.editor.unsnap();
        this.editingFeature.path = this.bbox;
        this.bbox.feature = this.editingFeature;
        this.editingFeature.layer = this.editor.layerIndex;
        this.bbox = null;
        this.editor.currentSample.objects.push(this.editingFeature);
        this.isDrawing = false;
        this.editor.pendingSegment = null;
        this.editor.fixOrderingForOneItem();
        this.editor.saveData();
        this.editor.updateGeometry(false);
        this.editor.clearActualSelection();
    };

}