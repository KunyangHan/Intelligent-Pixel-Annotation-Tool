import SseTool from "./SseTool";
import Paper from "paper";

export default class SseSuperPixelTool extends SseTool {

    constructor(editor) {
        super(editor);
        // this.editingPath = null; // The path currently created
        // this.editingPoint = null; // The second point for defining a rectangle
        // this.isDrawing = null; // True if a polygon is being created
        // this.snapOther = null; // True if the mouse snap something but the first point of the polygon being created
        // this.editingFeature = null; // Plain object to store the new polygon attributes
        // this.minDistance = 0;
        
        this.cursor = "crosshair";
        this.bindCallbacks();
        this.currentPixels = null;
    }


    cancel() {
        if (!this.editingPath) {
            return;
        }

        this.editor.deletePolygon(this.editingPath);

        this.editingPath = this.editor.newPath = this.editingPoint = this.editingFeature = null;
        this.isDrawing = this.snapOther = false;
        this.editor.updateGeometry(false);
        this.editor.updateCommands();
    }

    onMouseMove(event) {
        this.editor.zoomPoint = event.point;
        let point = this.editor.keepPointInsideRaster(event.point);
        let localPoint = this.editor.rasterLayer.globalToLocal(point);
        let offset = this.editor._getClickOffset(localPoint);
        // console.log("local point: ", localPoint, "offset", offset);

        let superpixelData = this.editor._getSuperpixelData();
        let superpixelIndex = this._getEncodedLabel(superpixelData.data, offset);
        // console.log("super index", superpixelIndex);
        let pixels = this.editor.pixelIndex[superpixelIndex];

        this.editor._updateHighlight(superpixelIndex);
    }

    onMouseDrag(event) {
        if (!this.isLeftButton(event) || event.modifiers.space)
            return super.viewDrag(event);
    }

    onMouseUp(event) {
        if (!this.isLeftButton(event) || event.modifiers.space)
            return super.viewUp(event);
    }

    onMouseDown(event) {
        if (!this.isLeftButton(event) || event.modifiers.space)
            return super.viewDown(event);
        let point;
        if (this.editor.snapIndicator) {
            point = this.editor.snapPoint;
        }
        else {            
            point = this.editor.rasterLayer.globalToLocal(this.editor.keepPointInsideRaster(event.point));
        }
        
        let offset = this.editor._getClickOffset(point);
        let superpixelData = this.editor._getSuperpixelData();
        let superpixelIndex = this._getEncodedLabel(superpixelData.data, offset);
        let pixels = this.editor.pixelIndex[superpixelIndex];

        this.editor._updateAnnotation(pixels);
    }

    endRectangle() {
        this.editor.setActualSelectionAsync([this.editingPath]);
        //this.editingPath.fullySelected = false;
        this.editor.unsnap();
        this.editingFeature.path = this.editingPath;
        this.editingPath.feature = this.editingFeature;
        this.editingFeature.layer = this.editor.layerIndex;
        this.editingPath = null;
        this.editor.currentSample.objects.push(this.editingFeature);
        this.isDrawing = false;
        this.editor.pendingSegment = null;
        this.editor.fixOrderingForOneItem();
        this.editor.saveData();
        this.editor.updateGeometry(false);
        this.editor.clearActualSelection();

    };

    _getEncodedLabel(array, offset) {
        // console.log("get encode label", array[offset], array[offset + 1]);
        // console.log(array[offset + 1] << 8, array[offset + 2], array[offset + 2] << 16);
        return array[offset] |
               (array[offset + 1] << 8) |
               (array[offset + 2] << 16);
    }
    
    _setEncodedLabel(array, offset, label) {
        array[offset + 0] = label & 255;
        array[offset + 1] = (label >>> 8) & 255;
        array[offset + 2] = (label >>> 16) & 255;
        array[offset + 3] = 255;
    }
    

}