import React from 'react';
import Paper from "paper";
import {withTracker} from 'meteor/react-meteor-data';
import url from "url";
import SseGeometry from "./SseGeometry";
import SsePointerTool from "./tools/SsePointerTool"
import SseCutTool from "./tools/SseCutTool";
import SsePolygonTool from "./tools/SsePolygonTool";
import SseRectangleTool from "./tools/SseRectangleTool";
import SseFloodTool from "./tools/SseFloodTool";
import ImageFilters from "canvas-filters";
import SseUndoRedo2d from "./SseUndoRedo2d";
import SseZoom from "./SseZoom.js";
import FileSaver from "file-saver";
import SseMsg from "../../common/SseMsg";
// import {writeFile} from "fs";
import SseSuperPixelTool from "./tools/SseSuperPixelTool";
import SseAiTool from "./tools/SseAiTool";
import SseAiIOGTool from "./tools/SseAiIOGTool";
import SseBrushTool from "./tools/SseBrushTool";
import segmentation from './segmentation';
import ColorScheme from "color-scheme";
// var segmentation = require('./segmentation');
import $ from "jquery";

// const https = require('https');

export default class SseEditor2d extends React.Component {
    constructor(props) {
        super();
        SseMsg.register(this);
        // Highlighted items on mouse hovering (Paths and Segments)
        this.pendingSelection = [];
        // Selected items on mouse click (Paths and Segments)
        this.actualSelection = [];

        // The active set of classes
        this.activeSoc = null;

        // A set of Items excluded from hit test.
        // For example to avoid snapping on the currently editing feature
        this.hitExcluded = new Set();
        // The opacity of polygons
        this.mainLayerOpacity = 0.35;
        this.layerIndex = 0;
        this.hiddenLayers = new Set();

        this.maskThreshold = 0.4;
        this.currentHistoryRecord = -1;
        this.history = [];
        this.maxHistoryRecord = 10;
        this.boundaryState = 0;

        this.brushSize = 2;

        this.undoRedo = new SseUndoRedo2d(this.cloningDataFunction);
        this.pointIndicators = new Set();
        this.initialized = false;
        window.onerror = (errorMsg, url, lineNumber) => {
            this.sendMsg("alert", {message: errorMsg});//or any message
            return false;
        };
    }

    /**
     * Compute geometrical characteristics related to the loading image
     */
    resizeCanvas() {

        const canvasContainer = $('#canvasContainer').get(0);
        if (!canvasContainer || !this.raster)
            return;
        this.viewWidth = canvasContainer.offsetWidth;
        this.viewHeight = canvasContainer.offsetHeight;
        Paper.project.view.viewSize = new Paper.Size(this.viewWidth, this.viewHeight);

        if (this.viewZoom) {
            this.viewZoom.destroy();
        }

        this.viewZoom = new SseZoom(this);

        const viewRatio = this.viewWidth / this.viewHeight;
        const bitmapRatio = this.imageWidth / this.imageHeight;

        let scaleFactor;

        const gutterRatio = .98;
        if (viewRatio < bitmapRatio) {
            scaleFactor = gutterRatio * canvasContainer.offsetWidth / this.imageWidth;
        }
        else {
            scaleFactor = gutterRatio * canvasContainer.offsetHeight / this.imageHeight;
        }

        this.offsetX = (this.viewWidth - scaleFactor * this.imageWidth) / 2;
        this.offsetY = (this.viewHeight - scaleFactor * this.imageHeight) / 2;

        this.sendMsg("zoomLevel", {value: Math.round(scaleFactor * 100) / 100});

        // zoomPoint keeps the mouse position on every mouse moves to be able to zoom to the
        // right position on mouse wheel events
        this.zoomPoint = new Paper.Point(this.viewWidth / 2, this.viewHeight / 2);

        // The scaling factor computed to display the whole image using the available room of the view
        this.scaleFactor = scaleFactor;
        const fullScreenMatrix = new Paper.Matrix().translate(this.offsetX, this.offsetY).scale(scaleFactor);
        this.transformAllLayers(fullScreenMatrix);
        this.disableSmoothing();
    }

    /**
     * This function returns always a point in the image to avoid drawing outside of the image
     * @param pt The original point that can be outside of the image
     * @returns {Paper.Point} The original point if inside the image,
     * the nearest point in the image otherwise
     */
    keepPointInsideRaster(pt) {
        const
            x = this.offsetX,
            y = this.offsetY,
            w = this.imageWidth * this.scaleFactor,
            h = this.imageHeight * this.scaleFactor;
        let px = pt.x, py = pt.y;

        if (px < x)
            px = x;
        else if (px > x + w)
            px = x + w;
        if (py < y)
            py = y;
        else if (py > y + h)
            py = y + h;

        return new Paper.Point(px, py);
    }

    deletePolygon(path) {
        this.currentSample.objects.splice(path.index, 1);
        path.remove();
        this.saveData();
        this.updateGeometry(false);
        path = null;
        this.clearActualSelection();
        this.updateCommands();
    }

    /**
     * Add points to the currently editing path to workaround an existing polygon
     */
    followPath() {
        if (this.pathToFollowInfos) {
            const infos = this.pathToFollowInfos;
            infos.index++;
            if (infos.index < infos.polylines.length) {
                this.drawPathFollowingGraphics();
            } else {
                infos.index = -1;
                this.undoPathFollowingGraphics();
            }
        }
    }

    mergePath() {

        if (this.selectedIntersections) {
            if (this.selectedIntersections.size > 1) {
                this.sendMsg("alert", {message: "Click on a polygon that overlaps the selected polygon."});
                this.mergingFirstPath = this.getFirstSelectedPolygon();
            } else {
                const other = this.selectedIntersections.values().next().value;
                const me = this.getFirstSelectedPolygon();
                this.mergePaths(me, other);
            }
        }
        this.sendMsg("pointer");
    }

    mergePaths(p1, p2) {
        const newPath = p1.unite(p2, {insert: false});
        if (newPath.segments) {
            this.mainLayer.addChild(newPath);
            p1.remove();
            p2.remove();
            newPath.feature = p1.feature;
            p1.feature.path = newPath;
            this.mergingFirstPath = null;
            this.setActualSelection([newPath]);
            this.fullUpdate();
        } else {
            this.sendMsg("alert", {message: "Merging cancelled: The resulting polygon can not contain hole(s)."})
        }
    }


    /**
     * Look for a pre-existing path to stick to during polygon creation
     * @param path
     */
    updatePathFollowingInfos(path) {
        if (path.segments.length < 3)
            return;
        const geom = this.geom;
        const pre = path.segments[path.segments.length - 3];
        const last = path.segments[path.segments.length - 2];
        const polylines = geom.findPath(pre, last);
        if (polylines.length > 0) {
            this.pathToFollowInfos = {index: -1, polylines: polylines, p1: pre.point, p2: last.point};

        } else {
            this.pathToFollowInfos = null;

        }
        this.updateCommands();
    }

    updateCommands() {
        if (this.newPath && this.newPath.segments.length > 3)
            this.sendMsg("enableCommand", {name: "enterCommand"});
        else
            this.sendMsg("disableCommand", {name: "enterCommand"});

        if (this.pathToFollowInfos)
            this.sendMsg("enableCommand", {name: "followCommand"});
        else
            this.sendMsg("disableCommand", {name: "followCommand"});

        if (this.actualSelection.length > 0)
            this.sendMsg("enableCommand", {name: "deleteCommand"});
        else
            this.sendMsg("disableCommand", {name: "deleteCommand"});

        if (this.selectedIntersections) {
            const sp = this.getSelectedPolygons()[0];
            const up = Array.from(this.selectedIntersections).some(p => sp.isBelow(p));
            const dw = Array.from(this.selectedIntersections).some(p => sp.isAbove(p));

            if (up)
                this.sendMsg("enableCommand", {name: "upCommand"});
            else
                this.sendMsg("disableCommand", {name: "upCommand"});
            if (dw)
                this.sendMsg("enableCommand", {name: "downCommand"});
            else
                this.sendMsg("disableCommand", {name: "downCommand"});
            this.sendMsg("enableCommand", {name: "mergeCommand"});
        }
        else {
            this.sendMsg("disableCommand", {name: "upCommand"});
            this.sendMsg("disableCommand", {name: "downCommand"});
            this.sendMsg("disableCommand", {name: "mergeCommand"});
        }
    }

    undoPathFollowingGraphics() {
        const removeSegments = (arr) => arr.forEach(s => s.remove());
        removeSegments(this.pathToFollowInfos.addedSegments);
    }

    drawPathFollowingGraphics() {
        const path = this.newPath;
        const infos = this.pathToFollowInfos;
        const removeSegments = (arr) => arr.forEach(s => s.remove());
        const addSegments = (polyline) => {
            infos.addedSegments = [];
            polyline.forEach(p => {
                const seg = new Paper.Segment(p);
                path.insert(path.segments.length - 2, seg);
                infos.addedSegments.push(seg);
            });
        };

        if (infos) {
            if (!infos.drawn) {
                addSegments(infos.polylines[infos.index]);
                infos.drawn = true;
            } else {
                removeSegments(infos.addedSegments);
                addSegments(infos.polylines[infos.index]);
            }
        }
    }

    /**
     * Common path properties
     * @param path
     */
    initPathProperties(path) {
        path.strokeWidth = 1;
        path.strokeScaling = false;
        path.strokeJoin = "round";
        path.blendMode = "normal";
        path.selectedColor = "white";
    }

    /**
     * The pending selection is a set of Items currently mouse hovered
     * @param itemsArray
     */
    setPendingSelection(itemsArray) {
        if (this.visibleStrokes)
            return;
        this.pendingSelection.forEach((ft) => {
            if (this.actualSelection.indexOf(ft) == -1) {
                ft.fullySelected = false;
            }
        });
        this.pendingSelection = [];
        if (itemsArray) {
            itemsArray.forEach((feat) => {
                this.pendingSelection.push(feat);
                feat.fullySelected = true;
            });
        }
    }

    /**
     * Create a visual indicator for the currently selected point
     * @param segment
     */
    drawPointSelection() {
        const segments = this.getSelectedPoints();
        if (this.pointIndicators) {
            this.pointIndicators.forEach(pi => pi.remove());
            this.pointIndicators.clear();
        }

        if (segments.length > 0) {
            this.frontLayer.activate();
            const l = 4 / (Paper.view.zoom * this.scaleFactor);
            segments.forEach(s => {
                const pt = s.point;
                const pointIndicator = new Paper.Path.Circle(new Paper.Point(pt.x, pt.y), l);
                this.pointIndicators.add(pointIndicator);
                // new Paper.Point(pt.x + l, pt.y + l));
                pointIndicator.fillColor = "red";
            });
            this.mainLayer.activate();
        }
    }

    get activeColor() {
        return this.activeSoc.colorForIndexAsHex(this.activeClassIndex);
    }

    get activeAntiColor() {
        let c = this.activeSoc.colorForIndexAsRGBArray(this.activeClassIndex);
        let ac = [];
        for (var i = 0; i < 3; i++) {
            ac.push(1 - c[i]);
        }
        return ac;
    }

    setActualSelectionAsync(arr) {
        setTimeout(() => {
            this.setActualSelection(arr);
        }, 0);
    }

    /**
     * The actual selection is a set of items the user clicked on It contains a polygon and an optional point,
     * a point is always selected with its hosting polygon)
     * @param arr
     */
    setActualSelection(arr) {
        this.actualSelection = arr;
        this.drawPointSelection();
        this.actualSelection.forEach(item => {
            //if (item.point)
            //    this.drawPointSelection();
            //else
            if (item.segments) {
                item.selectedColor = "red";
                item.strokeWidth = 3;
                item.fullySelected = true;
            }
        });

        const first = this.getFirstSelectedPolygon();
        if (first) {
            const feature = first.feature;
            if (feature.layer == undefined)
                feature.layer = 0;

            this.sendMsg("classSelection", {descriptor: this.activeSoc.descriptorForIndex(feature.classIndex)});
            this.selectedIntersections = this.geom.getIntersections(first);

            if (this.mergingFirstPath) {
                if (this.mergingFirstPath != first && this.geom.getIntersections(first)) {
                    this.mergePaths(this.mergingFirstPath, first);
                }
                else {
                    this.sendMsg("alert", {message: "Merging cancelled: the polygons don't intersect."});
                }
                this.mergingFirstPath = null;
            }
        }

        this.setPendingSelection();
        this.updateCommands();
        this.sendMsg("sse-polygon-select", {polygon: first});
    }

    clearActualSelection() {
        if (this.visibleStrokes)
            return;
        this.actualSelection.forEach((ft) => {
            ft.selectedColor = "white";
            ft.strokeWidth = 1;
            ft.fullySelected = false;
        });
        this.selectionSegment = null;
        this.drawPointSelection();
        this.actualSelection = [];
        this.selectedIntersections = null;
        this.updateCommands();
        this.sendMsg("sse-polygon-select", null);
    }


    /**
     * Persists the data on the server
     */
    saveData(ignoreUndo) {
        this.updateLayers();
        this.currentSample.socName = this.activeSoc.name;
        this.setCurrentSample(this.cloningDataFunction(this.currentSample));
        this.currentSample.objects = [];
        this.cleanupGraphicsHierarchy();


        this.mainLayer.children.forEach((path) => {
            const polygon = path.segments.map(
                (seg) => {
                    const p = seg.point;
                    return {
                        x: p.x, y: p.y
                    };
                });

            const p1 = polygon[0], p2 = polygon[polygon.length - 1];
            if (p1.x == p2.x && p1.y == p2.y) {
                polygon.pop();
            }

            path.polygon = polygon;


            this.currentSample.objects.push({
                classIndex: path.feature.classIndex,
                layer: path.feature.layer,
                polygon: path.polygon
            });
        });

        //if (!this.currentSample.objects.length) debugger;
        Meteor.call("saveData", this.currentSample);
        setTimeout(() => {
            this.updateStats();
        }, 10);

        if (!ignoreUndo) {
            this.undoRedo.pushState(this.currentSample);
        }
    }

    /**
     * Snap to an existing point of segment
     * @param pt The (x,y) point to snap to
     * @param color The color of the snapping indicator
     * @param shape "square" or "circle"
     * @param segment An optional segment belonging to the snapping point, null in case of
     * line snapping
     */
    snap(pt, color = "white", shape = "square", segment) {
        // No argument: redraw the current snapping indicator (on a zoom action for example)
        if (pt == undefined && this.snapPoint) {
            this.snapIndicator.remove();
            this.snap(this.snapPoint, this.snapColor);
        }
        else if (pt) {
            if (this.snapIndicator)
                this.snapIndicator.remove();
            // The snapping indicator is drawn on top of polygons
            this.frontLayer.activate();
            // Adjust the size of the snapping indicator according to the zoom level
            const l = (color == "red" ? 4 : 2) / (Paper.view.zoom * this.scaleFactor);

            if (shape == "square") {
                this.snapIndicator = new Paper.Path.Rectangle(
                    new Paper.Point(pt.x - l, pt.y - l),
                    new Paper.Point(pt.x + l, pt.y + l));
            } else if (shape == "circle") {
                this.snapIndicator = new Paper.Path.Circle(pt, l);
            }
            this.snapIndicator.strokeScaling = false;
            this.snapIndicator.fillColor = color;
            this.snapIndicator.strokeColor = null;
            this.mainLayer.activate();
        }
        if (pt != undefined) {
            this.snapPoint = pt;
            this.snapColor = color;
            this.snapSegment = segment;
        }
    }

    /**
     * Remove the current snapping indicator and attributes
     */
    unsnap() {
        if (this.snapIndicator) {
            this.snapIndicator.remove();
            delete this.snapIndicator;
            this.snapPoint = null;
            this.snapColor = null;
            this.snapSegment = null;
        }
    }

    /**
     * Apply the zoom/pan transformation to all layers
     * @param mat
     */
    transformAllLayers(mat) {
        // return;
        this.rasterLayer.matrix = mat;
        this.frontLayer.matrix = mat;
        this.mainLayer.matrix = mat;
        this.debugLayer.matrix = mat;
        this.superLayer.matrix = mat;
    }

    /**
     * Draws the annotations retrieved from the server
     */
    drawAnnotations() {
        this.mainLayer.activate();
        this.mainLayer.removeChildren();
        this.currentSample.objects.forEach((feature) => {
            const pts = feature.polygon.map((pt) => {
                return new Paper.Point(pt.x, pt.y)
            });

            const path = new Paper.Path(pts);
            this.initPathProperties(path);
            feature.path = path;
            path.feature = feature;
            path.closed = true;

            this.setColor(path, this.activeSoc.colorForIndexAsHex(feature.classIndex));
        });
        this.updateGeometry(false);
        this.disableComposition();
        this.enableComposition();
    }

    repaint() {
        this.mainLayer.activate();
        this.mainLayer.children.forEach((path) => {
            this.setColor(path, this.activeSoc.colorForIndexAsHex(path.feature.classIndex));
        });
    }

    fixOrderingForOneItem() {
        //debugger;
        let cursorItem, end, items = this.mainLayer.children.concat();
        items.some(item => {
            if (!cursorItem)
                cursorItem = item;
            else {
                if ((item.feature.layer || 0) < (cursorItem.feature.layer || 0)) {
                    item.moveBelow(cursorItem);
                    end = true;
                    return true;
                } else if ((item.feature.layer || 0) > (cursorItem.feature.layer || 0)) {
                    cursorItem = item;
                }
            }
        });
        if (!end) {
            items.reverse().some(item => {
                if (!cursorItem)
                    cursorItem = item;
                else {
                    if ((item.feature.layer || 0) > (cursorItem.feature.layer || 0)) {
                        item.moveFront(cursorItem);
                        return true;
                    } else if ((item.feature.layer || 0) < (cursorItem.feature.layer || 0)) {
                        cursorItem = item;
                    }
                }
            });
        }
    }

    updateGeometry(ignoreLastPolygon) {
        const start = new Date().getTime();
        this.cleanupGraphicsHierarchy();
        this.geom = new SseGeometry(this.mainLayer.children, ignoreLastPolygon);
        this.geom.computePolygonsIntersections();
        // console.log("Geometry updated in", (new Date().getTime() - start) + "ms")
    }

    cleanupGraphicsHierarchy() {
        this.mainLayer.children.forEach(pol => {
            let rc = pol.resolveCrossings();
            rc.feature = pol.feature;
            this.flattenNonSimplePath(rc)
        });
        this.mainLayer.children.forEach(pol => {
            if (pol.bounds.width < 2 || pol.bounds.height < 2 || pol.bounds.area < 10) {
                pol.remove();
            }
        });
    }

    flattenNonSimplePath(rpath) {
        if (rpath.children) {
            rpath.children.concat().forEach(npath => {
                npath.fillColor = rpath.fillColor;
                npath.strokeColor = rpath.strokeColor;
                npath.strokeWidth = rpath.strokeWidth;
                npath.selectedColor = rpath.selectedColor;
                npath.strokeScaling = rpath.strokeScaling;
                npath.feature = {classIndex: rpath.feature.classIndex, layer: rpath.feature.layer, polygon: []};
                this.mainLayer.addChild(npath);
                npath.fullySelected = false;
            });
            rpath.remove();
            this.clearActualSelection();
        }
    }

    /**
     * Set the color of a polygon depending on the current composition mode
     * @param path
     * @param color
     */
    setColor(path, color) {
        if (this.disabledComposition) {
            path.strokeColor = color;
            path.fillColor = null;

        } else {
            path.fillColor = color;
            path.strokeColor = "white"
        }
    }

    setSelectedColor(path) {
        path.selectedColor = "red";
    }


    /**
     *  Enables alpha composition of layers
     */
    enableComposition(hideStroke) {
        //return this.disableComposition();
        if (this.disabledComposition) {
            this.disabledComposition = false;
            this.mainLayer.getChildren().forEach((path) => {
                if (!this.newPath || this.newPath != path) {
                    path.fillColor = path.strokeColor;
                    if (!hideStroke)
                        path.strokeColor = "white";
                }

            });
            /*
            if (this.newPath) {
                this.newPath.fillColor = this.newPath.strokeColor;
                this.newPath.strokeColor = "white";
            }
            */
            this.mainLayer.opacity = this.mainLayerOpacity;
        }
    }

    /**
     *  Disables alpha composition of layers
     */
    disableComposition() {

        if (!this.disabledComposition) {
            this.disabledComposition = true;
            this.mainLayer.getChildren().forEach((path) => {
                if (!this.newPath || this.newPath != path) {
                    path.strokeColor = path.fillColor;
                    path.fillColor = null;
                }
            });
            /*
            if (this.newPath) {
                this.newPath.strokeColor = this.newPath.fillColor;
                this.newPath.fillColor = null;
            }
            */
            this.mainLayer.opacity = 1;

        }
    }

    onZoom(zoomLvl) {
        if (zoomLvl > 5) {
            this.disableComposition();
        } else {
            this.enableComposition();
        }

        this.sendMsg("zoomLevel", {value: Math.round(100 * zoomLvl * this.scaleFactor) / 100});
        this.zoomLevel = zoomLvl;
        this.snap();
        this.drawPointSelection();
    }

    getFirstSelectedPolygon() {
        const sps = this.getSelectedPolygons();
        if (sps.length > 0)
            return sps[0];
    }

    getSelectedPolygons() {
        return this.actualSelection.filter(element => !element.point);
    }

    getSelectedPoints() {
        return this.actualSelection.filter(element => element.point);
    }

    isoSegments(segment) {
        return this.geom.isoSegments(segment);
    }

    /**
     * Global hit testing functions used by all the tools. It is affected by this.hitExcluded, this.pendingSegment,
     * and this.isoMap.
     * @param event
     */
    hitTesting(event) {
        const matchFunction = (ht) => {
            // Rejected hits: pixels, snap indicator and point indicator
            let accept = ht.type != "pixel" &&
                ht.item != this.snapIndicator &&
                !this.pointIndicators.has(ht.item) &&
                !this.hitExcluded.has(ht.item) &&
                ht.item.layer != this.debugLayer;

            // Point snapping: tests if the hitting segment is excluded
            if (accept && ht.segment) {
                accept = accept && !this.hitExcluded.has(ht.segment);
            }

            if (accept && this.pendingSegment)
            // Rejects first point snapping if not a polygon with at least 3 vertices
                accept = accept &&
                    (ht.item != this.pendingSegment.path || (ht.segment && ht.segment.index == 0 &&
                        ht.segment.path.segments.length > 3));

            // If there is already a selected polygon and the mouse is over a point with iso-points, always select the
            // point that belongs to the selected polygon
            if (accept && this.actualSelection.length > 0 && ht.type == "segment") {
                const isoSegments = this.isoSegments(ht.segment);
                if (isoSegments) {
                    const polygons = this.getSelectedPolygons();
                    if (polygons) {
                        if (polygons[0] == ht.item) {
                            accept = true;
                        } else {
                            let iter = isoSegments.values();
                            let found = false;
                            let seg = iter.next();
                            while (!found && !seg.done) {
                                if (seg.value != ht.segment && seg.value.path == polygons[0]) {
                                    accept = false;
                                    found = true;
                                }
                                seg = iter.next();
                            }
                        }
                    }
                }
            }
            else if (accept && this.actualSelection.length > 0 && ht.type == "curve") {
                const isoSegments = this.isoSegments(ht.location.segment);
                if (isoSegments) {
                    const polygons = this.getSelectedPolygons();
                    if (polygons) {
                        if (polygons[0] == ht.item) {
                            accept = true;
                        } else {
                            let iter = isoSegments.values();
                            let found = false;
                            let seg = iter.next();
                            while (!found && !seg.done) {
                                if (seg.value != ht.location.segment && seg.value.path == polygons[0]) {
                                    accept = false;
                                    found = true;
                                }
                                seg = iter.next();
                            }
                        }
                    }
                }
            }

            return accept;
        };

        // Parameters for detecting polygon hits
        const areas = {
            curves: false,
            segments: false,
            handles: false,
            match: matchFunction,
            stroke: false,
            fill: true
        };
        // Parameters for detecting point and line hits
        const pointsAndLines = {
            curves: true,
            segments: true,
            handles: false,
            match: matchFunction,
            stroke: false,
            fill: false
        };

        // Adjust the tolerance according to the zoom level
        this.hitTolerance = areas.tolerance = pointsAndLines.tolerance = 7 / (this.scaleFactor * Paper.view.zoom);

        const hitPointsAndLines = Paper.project.hitTest(event.point, pointsAndLines);
        const hitAreas = Paper.project.hitTest(event.point, areas);

        // This class-level state attribute holds synthetic hit testing informations
        this.hitInfos = (hitAreas || hitPointsAndLines) ? {} : null;

        if (hitAreas) {
            // Polygon hit testing
            this.hitInfos.polygon = hitAreas.item;
            this.hitInfos.type = "polygon";
        }
        if (hitPointsAndLines) {
            if (!this.hitInfos.polygon)
                this.hitInfos.polygon = hitPointsAndLines.item;
            this.hitInfos.point = hitPointsAndLines.point;
            if (hitPointsAndLines.type == "curve") {
                // Line hit testing
                this.hitInfos.type = "line";
                this.hitInfos.location = hitPointsAndLines.location;
                this.hitInfos.polygon = hitPointsAndLines.item;
                //this.hitInfos.pointOrLinePolygon = hitPointsAndLines.item;
            } else {
                // Point hit testing
                this.hitInfos.segment = hitPointsAndLines.segment;
                this.hitInfos.polygon = this.hitInfos.segment.path;
                if (this.pendingSegment) {
                    const isoSegments = this.isoSegments(hitPointsAndLines.segment) || new Set();
                    let iter = isoSegments.values();
                    let found = false;
                    let seg = iter.next();
                    while (!found && !seg.done) {

                        if (seg.value != hitPointsAndLines.segment &&
                            seg.value.path == this.pendingSegment.path) {
                            this.hitInfos.segment = this.pendingSegment.path.firstSegment;
                            this.hitInfos.polygon = this.hitInfos.segment.path;
                            found = true;
                        }
                        seg = iter.next();
                    }

                }
                this.hitInfos.type = "point";
                //this.hitInfos.pointOrLinePolygon = hitPointsAndLines.item;
            }
        }
        if (this.hitInfos) {
            this.onSnap(this.hitInfos);
        }
    }

    onSnap(hi) {

    }

    /**
     * Reset the component when unmounting
     */
    componentWillUnmount() {
        $(window).off('resize');
        $("#sourceImage").off("load");
        $("body").off("wheel");
        $(document).off("keydown");
        $(document).off("keyup");
        this.pointerTool.remove();

        this.cutTool.remove();
        this.rectangleTool.remove();
        this.polygonTool.remove();
        this.snapIndicator = this.snapColor = this.snapPoint = this.snapSegment = null;
        this.setCurrentSample(null);
        this.mainLayer.remove();
        this.rasterLayer.remove();
        this.frontLayer.remove();
        this.debugLayer.remove();
        if (this.raster)
            this.raster.remove();
        //TODO: need to be reimplemented in toolbars
        //Mousetrap.reset();
    }

    /**
     * Treat the update as an initialization
     */

    /*
    componentDidUpdate() {
        this.componentWillUnmount();
        this.componentDidMount();
    }

*/

    
    // getBoundaryUrl(arg) {
    //     return "/boundary" + arg.slice(0, arg.indexOf('.')) + ".png";
    // }

    // loadBoundary(){
    //     const maskImage = $("#mask");
    //     url = "/boundary" + this.props.imageUrl.slice(0, this.props.imageUrl.indexOf('.')) + ".png";
    //     maskImage.attr("src", url);

    //     const mask = $("#mask").get(0);
    //     const ctx = this.filterCanvas.getContext("2d");
    //     let oriImgData = ctx.getImageData(0, 0, this.imageWidth, this.imageHeight);
        
    //     setTimeout(() => {
    //         ctx.drawImage(mask, 0, 0);
    //         console.log(this.filterCanvas.width, this.filterCanvas.height);
    //         console.log(mask.width, mask.height);
    //         let maskData = ctx.getImageData(0, 0, mask.width, mask.height);
    
    //         let offset = 0;
    //         for (var i = 0; i < this.imageHeight; i++) {
    //             for (var j = 0; j < this.imageWidth; j++) {
    //                 maskData.data[offset + 3] = 255 - maskData.data[offset + 0];
    //                 offset += 4;
    //             }
    //         }
    //         this.boundary.setImageData(maskData, 0, 0);
    
    //         maskImage.attr("src", '');
    //         ctx.putImageData(oriImgData, 0, 0);
    //     }, 1000);
    // }

    setupMessages() {
        this.onMsg("classSelection", ({descriptor}) => {
            const classIndex = descriptor.classIndex;

            this.activeClassIndex = classIndex;

            if (this.actualSelection.length) {
                const first = this.getSelectedPolygons()[0];
                if (first.feature.classIndex != classIndex) {
                    first.feature.classIndex = classIndex;

                    this.setColor(first, this.activeSoc.colorForIndexAsHex(classIndex));

                    this.setActualSelectionAsync(this.actualSelection);

                    this.saveData();
                }
            }
        });

        this.onMsg("instanceSelection", ({instance}) => {
            this.activeInstanceIndex = instance.maskValue;
        });

        this.onMsg("instanceHighlight", ({instance}) => {
            this.instanceHighlight(instance.maskValue);
        });

        this.onMsg("instanceDeHighlight", ({instance}) => {
            this.instanceDeHighlight(instance.maskValue);
        });

        this.onMsg("recommendSelection", ({recommend}) => {
            this.curRecommendIdx = recommend.idx;
            this.recommendSelect(recommend);
        });

        this.onMsg("editRecommend", () => {
            this.initInstanceVisualBgr();
            setTimeout(() => {
                this.resizeCanvas();
            }, 500);
        });

        this.onMsg("instanceCheckbox", (arg) => {
            this.updateInstanceVisual(arg.ins);
        });

        this.onMsg("undo", () => this.undo());
        this.onMsg("redo", () => this.redo());

        this.onMsg("tagsChanged", () => this.saveData(true));

        this.onMsg("openJsonView", () => {
            window.open(document.URL.replace("edit", "api/json"));
        });

        this.onMsg("selectAll", (args) => {
            this.mainLayer.children.forEach(p => p.fullySelected = (args.value == true));
        });

        this.onMsg("opacityChange", (args) => {
            this.mainLayer.opacity = this.mainLayerOpacity = Math.max(0.1, parseFloat(args.value));
            // this._updateVisualizationOpacity();
            this.visualization.opacity = this.mainLayerOpacity;
        });
        this.onMsg("boundaryOpacityChange", (args) => {
            this.boundary.opacity = Math.max(0.1, parseFloat(args.value));
        });

        this.onMsg("brushChange", (args) => {
            this.brushSize = Math.max(Math.round(args.value), 0);
        });

        this.onMsg("filterChange", this.updateFilter.bind(this));

        this.onMsg("reset-end", () => {
            this.mainLayer.removeChildren();
            this.frontLayer.removeChildren();
            this.currentSample.tags = [];
            this.fullUpdate();
        });

        this.onMsg("layer-select", (arg) => {
            this.clearActualSelection();
            this.layerIndex = arg.index;
        });

        this.onMsg("layer-hide", (arg) => {
            this.clearActualSelection();
            this.hiddenLayers.add(arg.index);
            this.mainLayer.children
                .filter(pol => (arg.index == 0 && pol.feature.layer == undefined) || pol.feature.layer == arg.index)
                .forEach(pol => {
                    pol.fullySelected = false;
                    pol.visible = false;
                });
        });

        this.onMsg("layer-show", (arg) => {
            this.hiddenLayers.delete(arg.index);
            this.mainLayer.children
                .filter(pol => (arg.index == 0 && pol.feature.layer == undefined) || pol.feature.layer == arg.index)
                .forEach(pol => pol.visible = true);
        });

        this.onMsg("download", () => {
            this.download();
        });

        this.onMsg("polygon-set-layer", arg => {
            arg.polygon.feature.layer = arg.layer;
            this.fixOrderingForOneItem();
            this.updateLayers();
            this.fullUpdate();
            this.setActualSelection([arg.polygon]);
        });

        this.onMsg("class-multi-select", (arg) => {
            this.clearActualSelection();
            this.setActualSelection(this.mainLayer.children.filter(p => p.feature.classIndex == arg.classIndex))
        });

        this.onMsg("delete", () => this.delete());
        this.onMsg("moveback", () => this.moveBack());
        this.onMsg("movefront", () => this.moveFront());
        this.onMsg("merge", () => this.mergePath());
        this.onMsg("follow", () => this.followPath());

        this.onMsg("pointer", () => this.pointerTool.activate());
        this.onMsg("cut", () => this.cutTool.activate());
        this.onMsg("polygon", () => this.polygonTool.activate());
        this.onMsg("rectangle", () => this.rectangleTool.activate());
        this.onMsg("flood", () => this.floodTool.activate());
        this.onMsg("brushmode", () => this.brushTool.activate());
        this.onMsg("superpixel", () => this.set2Superpixel());
        this.onMsg("instancemode", () => this.set2Instance());
        this.onMsg("finer", () => {
            if (this.visualization.visible == true && (this.isInstance === undefined || !this.isInstance)) {
                this.segmentation.finer();
                this._updateSuperpixels();
            }
        });
        this.onMsg("coarser", () => {
            if (this.visualization.visible == true && (this.isInstance === undefined || !this.isInstance)) {
                this.segmentation.coarser();
                this._updateSuperpixels();
            }
        });
        this.onMsg("saveannotate", () => {
            this.saveAnnotate();
        });
        this.onMsg("iogpoint", () => {
            this.boundary.visible = false;
            this.iog_point.activate();
        });
        this.onMsg("iogscribble", () => {
            this.boundary.visible = false;
            this.aiTool.activate();
        });
        this.onMsg("boundaryonoff", () => {
            if (this.visualization.visible == true) {
                if (this.boundaryState === 0) {
                    // Using post transmit start single
                    // Not working, maybe .bind(this) is needed
                    // HTTP.call('POST', 'http://127.0.0.1:5000/boundary', {
                    //     data: {
                    //         'filename': this.props.imageUrl
                    //     }
                    // }, function( error, response ) {
                    //     if ( error ) {
                    //         console.log( error );
                    //     } else {
                    //         this.loadBoundary();
                    //     }
                    // });

                    // HTTP.call('POST', 'http://127.0.0.1:5000/boundary', {
                    //     data: {
                    //         'filename': this.props.imageUrl
                    //     }
                    // }, function(error, response) {
                    //     if ( error ) {
                    //         console.log( error );
                    //     } else {
                    //         this.loadBoundary();
                    //     }
                    // }.bind(this));
                    // this.boundaryState = 1;

                    // Using folder scanning way transmit start single
                    // Added extra Meteor call function and serveStatic files setting
                    // Meteor.call('savePoint', [0, 0], this.props.imageUrl, "boundary_input");
                    // this.loadBoundary();
                    
                    this.boundary.visible = false;
                    this.boundaryState = 2;
                } else if (this.boundaryState === 1) {
                    this.boundary.visible = false;
                    this.boundaryState = 2;
                } else {
                    this.boundary.setImageData(this.boundaryDataV2, 0, 0);
                    this.boundary.visible = true;
                    this.boundaryState = 1;
                }
            }
            // if (this.visualization.visible == true) {
            //     if (this.boundaryState === 2) {
            //         this.boundary.setImageData(this.boundaryDataV1, 0, 0);
            //         this.boundaryState = 1;
            //     } else if (this.boundaryState === 1) {
            //         this.boundary.visible = false;
            //         this.boundaryState = 0;
            //     } else {
            //         this.boundary.setImageData(this.boundaryDataV2, 0, 0);
            //         this.boundary.visible = true;
            //         this.boundaryState = 2;
            //     }
            // }
        });


        this.onMsg("strokes", (arg) => this.showStrokes(arg.value));
        this.onMsg("closepolygon", () => (
            (Paper.tool == this.polygonTool ? this.polygonTool : this.floodTool).endPolygon()));

        this.onMsg("active-soc", arg => {
            if (this.activeSoc != arg.value) {
                this.activeSoc = arg.value;
                this.activeClassIndex = 0;
                this.repaint();
            }
        });


    }

    /**
     * Editor initialization
     */
    componentDidMount() {
        this.setupMessages();
        if (!this.initialized) {
            this.initialized = true;
        }

        Mousetrap.bind("esc", () => this.cancel());


        const canvas = $('#rasterCanvas').get(0);

        Paper.setup(canvas);

        // The layer for the image
        this.rasterLayer = new Paper.Layer();
        this.rasterLayer.applyMatrix = false;

        // The layer for drawing the annotations
        this.mainLayer = new Paper.Layer();
        this.mainLayer.applyMatrix = false;
        this.mainLayer.opacity = this.mainLayerOpacity;

        // The front layer for snapping and selection indicators
        this.frontLayer = new Paper.Layer();
        this.frontLayer.applyMatrix = false;
        this.frontLayer.opacity = 0.3;
        // this.frontLayer.blendMode = "difference";
        /*
        this.mainLayer.activate();
        const bug = new Paper.Path([{x: 1, y: 1}, {x: 30, y: 30}]);
        bug.strokeColor = "red"
*/
        // The front layer for snapping and selection indicators
        this.debugLayer = new Paper.Layer();
        this.debugLayer.applyMatrix = false;

        // The superpixel layer for superpixel function
        this.superLayer = new Paper.Layer();
        this.superLayer.applyMatrix = false;
        // this.superLayer.opacity = 0.3;

        // Registers hit testing on all layers
        this.rasterLayer.onMouseMove = this.hitTesting.bind(this);
        this.mainLayer.onMouseMove = this.hitTesting.bind(this);
        this.frontLayer.onMouseMove = this.hitTesting.bind(this);
        this.superLayer.onMouseMove = this.hitTesting.bind(this);

        this.rasterLayer.activate();

        this.polygonTool = new SsePolygonTool(this);
        this.pointerTool = new SsePointerTool(this);
        this.cutTool = new SseCutTool(this);
        this.rectangleTool = new SseRectangleTool(this);
        this.floodTool = new SseFloodTool(this);
        this.superpixelTool = new SseSuperPixelTool(this);
        this.brushTool = new SseBrushTool(this);
        this.aiTool = new SseAiTool(this);
        this.iog_point = new SseAiIOGTool(this);
        $(window).on('resize', this.resizeCanvas.bind(this));

        const record = SseSamples.findOne({url: this.props.imageUrl});
        // Initialize the data model object with an existing one from the server or
        // with an empty one

        this.setCurrentSample(record || {url: this.props.imageUrl, objects: []});

        // Disable context menu
        $('body').on('contextmenu', 'div', function () {
            return false;
        });

        this.sendMsg("editor-ready", {value: this.currentSample});
        this.imageLoaded();


        // this.interval = setInterval(() => this.tick(), 30000);
    }

    recommendSelect(rcm) {
        this.visualization.setImageData(rcm.visual, 0, 0);
    }

    componentWillUnmount(){
        SseMsg.unregister(this);
        // clearInterval(this.interval);
    }

    tick() {
        // console.log("auto saved");
        if (this.visualization.visible == true) {
            this.saveAnnotate();
            this.sendMsg("alert",
                    {
                        variant: "Note",
                        message: "auto saved",
                        autoHide: true
                    }, (err) => {});
        }
    }

    init2Superpixel() {
        // this._updateVisualization();
        // this.superpixelTool.activate();
        // this.mainLayer.visible = false;
        // this.boundary.visible = true;
        this.visualization.visible = true;
        this.annotation.visible = false;
        this.resetSuperpixels({});
    }

    enableSuperpixelTool() {
        this.clearAux();
        this.superpixelTool.activate();
        // this.mainLayer.visible = false;
        // this.boundary.visible = true;
        this.visualization.visible = true;
        this.annotation.visible = false;
    }

    set2Superpixel() {
        this.enableSuperpixelTool();
    }

    initInstance() {
        const mask = $("#instance").get(0);
        const ctx = this.filterCanvas.getContext("2d");
        let oriImgData = ctx.getImageData(0, 0, this.imageWidth, this.imageHeight);

        if (mask.width === this.imageWidth && mask.height === this.imageHeight) {
            console.log("Instance mask data found");
            let newAnnoData = ctx.createImageData(this.imageWidth, this.imageHeight);
            let newVisualData = ctx.createImageData(this.imageWidth, this.imageHeight);
            ctx.drawImage(mask, 0, 0);

            let maskData = ctx.getImageData(0, 0, mask.width, mask.height);
            let superData = this.ins2SuperData255(maskData);
            this.instanceNum = superData[1] + 1;
            this.insPixelIndex = this._createPixelIndex(superData[0].data, this.instanceNum);
            let newInstance = this.genInstanceList(this.insPixelIndex);
            let newRecommend = this.genRecommend(newInstance, [this.genRecommendScale.bind(this), this.genRecommendPos.bind(this)]);

            this.instanceMask.setImageData(superData[0], 0, 0);

            console.log(newInstance);
            this.sendMsg("addInstanceList", {list: newInstance});
            this.sendMsg("genRecommend", {list: newRecommend});

            // this._updateBoundaryLayer();

            ctx.putImageData(oriImgData, 0, 0);
        }
    }

    set2Instance() {
        this.enableSuperpixelTool();
        if (this.isInstance === undefined) {
            console.log("set2instance first time");
            
            const maskImage = $("#mask");
            let url = this.props.imageUrl;
            maskImage.attr("src", "/instance_mask" + url.slice(0, url.indexOf('.')) + ".png");
    
            const mask = $("#mask").get(0);
            const ctx = this.filterCanvas.getContext("2d");
            let oriImgData = ctx.getImageData(0, 0, this.imageWidth, this.imageHeight);
    
            if (mask.width === this.imageWidth && mask.height === this.imageHeight) {
                console.log("Instance mask data found");
                let newAnnoData = ctx.createImageData(this.imageWidth, this.imageHeight);
                let newVisualData = ctx.createImageData(this.imageWidth, this.imageHeight);
                ctx.drawImage(mask, 0, 0);

                let maskData = ctx.getImageData(0, 0, mask.width, mask.height);
                let superData = this.ins2SuperData(maskData);
                let pixelIndex = this._createPixelIndex(superData.data, 255);
                let annoVisualList = this.idx2AnnoVisualData(newAnnoData, newVisualData, pixelIndex);
                
                this.backupSuperData = this._getSuperpixelData();
                this.backupAnnoData = this._getAnnotationData();
                this.backupVisualData = this._getVisualizationData();
                this.backupIndex = this.pixelIndex;

                this.superPixel.setImageData(superData, 0, 0);
                this.annotation.setImageData(annoVisualList[0], 0, 0);
                this.visualization.setImageData(annoVisualList[1], 0, 0);
                this.pixelIndex = pixelIndex;

                this._updateBoundaryLayer();

                if (maskData !== null) {
                    this.isInstance = true;
                    maskImage.attr("src", '');
                    ctx.putImageData(oriImgData, 0, 0);
                }
            }
            else {
                setTimeout(() => {
                    this.set2Instance();
                }, 100);
            }
        }
        else {
            this.istSppSwitch();
            this.isInstance = true;
        }
    }

    genInsColorDic() {
        const scheme = new ColorScheme;
        
        scheme.from_hue(0)
            .scheme('mono')
            .variation('soft');
        let color = scheme.colors();
        let bgrInsColor = [color[0], color[1], color[3]];
        // scheme.from_hue(30)
        //     .scheme('mono')
        //     .variation('soft');
        // color = scheme.colors();
        // bgrInsColor = bgrInsColor.concat([color[0], color[1], color[3]]);
        // scheme.from_hue(330)
        //     .scheme('mono')
        //     .variation('soft');
        // color = scheme.colors();
        // bgrInsColor = bgrInsColor.concat([color[0], color[1], color[3]]);
        // --------------Note : comment line below to gen multi color--------------
        bgrInsColor = ["bf6060"];
        // ------------------------------------------------------------------------
        let bgrInsColorDec = Array(bgrInsColor.length);
        bgrInsColor.forEach((c, i) => {
            bgrInsColorDec[i] = [parseInt("0x" + c.slice(0, 2)), 
                parseInt("0x" + c.slice(2, 4)),
                parseInt("0x" + c.slice(4, 6))]
        })

        scheme.from_hue(180)
            .scheme('mono')
            .variation('hard');
        color = scheme.colors();
        let fgrInsColor = [color[0], color[1], color[3]];
        // scheme.from_hue(150)
        //     .scheme('mono')
        //     .variation('hard');
        // color = scheme.colors();
        // fgrInsColor = fgrInsColor.concat([color[0], color[1], color[3]]);
        // scheme.from_hue(210)
        //     .scheme('mono')
        //     .variation('hard');
        // color = scheme.colors();
        // fgrInsColor = fgrInsColor.concat([color[0], color[1], color[3]]);
        // --------------Note : comment line below to gen multi color--------------
        fgrInsColor = ["41e8dd"];
        // ------------------------------------------------------------------------
        let fgrInsColorDec = Array(fgrInsColor.length);
        fgrInsColor.forEach((c, i) => {
            fgrInsColorDec[i] = [parseInt("0x" + c.slice(0, 2)), 
                parseInt("0x" + c.slice(2, 4)),
                parseInt("0x" + c.slice(4, 6))]
        })

        // 255 non-instance; 0 background instance; 1 foreground instance
        this.insColorDic = {255 : [[255, 255, 255]],
            0 : bgrInsColorDec,
            1 : fgrInsColorDec
        }
        console.log(this.insColorDic);
    }

    getInsColor(anno) {
        anno = (anno > 0 && anno < 255) ? 1 : anno;

        let colorList = this.insColorDic[anno];
        return colorList[Math.floor(Math.random() * colorList.length)];
    }

    ins2SuperData255(data) {
        let offset = 0;
        let max_i = 0;
        for (var i = 0; i < this.imageHeight; i++) {
            for (var j = 0; j < this.imageWidth; j++) {
                let cur_i = data.data[offset];
                if (cur_i > max_i) {
                    max_i = cur_i;
                }
                data.data[offset + 1] = 0;
                data.data[offset + 2] = 0;
                data.data[offset + 3] = 255;
                offset += 4;
            }
        }

        return [data, max_i];
    }

    genRecommendVisual(rcm) {
        const ctx = this.filterCanvas.getContext("2d");
        let newVisualData = ctx.createImageData(this.imageWidth, this.imageHeight);
        let maskList = rcm.foreground;

        for (let i = 0; i < newVisualData.data.length; i++) {
            newVisualData.data[i] = 255;
        }

        for (let i = 0; i < maskList.length; i++) {
            let color = this.getInsColor(1); // foreground
            // let color = insList[i].colorList;
            for (let offset of this.insPixelIndex[maskList[i]]) {
                newVisualData.data[offset + 0] = color[0];
                newVisualData.data[offset + 1] = color[1];
                newVisualData.data[offset + 2] = color[2];
                newVisualData.data[offset + 3] = 255;
            }
        }

        return newVisualData;
    }

    genRecommend(insList, funList) {
        let rcmList = new Array();

        for (let i = 0; i < funList.length; i++) {
            let rcm = funList[i](insList);
            rcm.idx = i;
            rcm.visual = this.genRecommendVisual(rcm);

            rcmList.push(rcm);
        }
        this.curRecommendIdx = 0;
        this.visualization.setImageData(rcmList[0].visual, 0, 0);

        return rcmList;
    }

    genRecommendScale(insList) {
        let threshold = this.instanceThreshold != undefined ? this.instanceThreshold : 0.03;
        let rcm = new Object();
        rcm.mode = "Scale";
        rcm.foreground = new Array();
        // rcm.insList = new Array();

        for (let i = 1; i < insList.length; i++) {
            let ins = insList[i];
            if (ins.scale > threshold) {
                rcm.foreground.push(ins.maskValue);
                // rcm.insList.push(ins);
            }
        }
        console.log(rcm.foreground);

        return rcm;
    }

    calEuclidean(target1, target2) {
        let h2 = Math.pow(target1[0] - target2[0], 2);
        let w2 = Math.pow(target1[1] - target2[1], 2);
        
        return Math.sqrt(h2 + w2);
    }

    genRecommendPos(insList) {
        // let targetWidth = this.imageWidth / 2;
        // let targetHeight = this.imageHeight / 2;
        let threshold = this.insPosThreshold != undefined ? this.insPosThreshold : 0.5;
        let target = [this.imageHeight / 2, this.imageWidth / 2];
        let maxLen = this.calEuclidean(target, [0, 0]);
        let rcm = new Object();
        rcm.mode = "Position";
        rcm.foreground = new Array();

        for (let i = 1; i < insList.length; i++) {
            let ins = insList[i];
            let len = this.calEuclidean(target, ins.center);
            
            if ((len / maxLen) < threshold) {
                rcm.foreground.push(ins.maskValue);
            }
        }
        console.log(rcm.foreground);

        return rcm;
    }

    genInstanceList(index) {
        let insList = new Array();
        let totalPix = this.imageHeight * this.imageWidth;
        let threshold = this.instanceThreshold != undefined ? this.instanceThreshold : 0.03;

        for (let i = 0; i < this.instanceNum; i++) {
            if (index[i].size == 0) {
                continue;
            }
            let obj = new Object();
            obj.maskValue = i;
            obj.isForeground = i == 0 ? 255 : false;
            obj.class = 0;  // TODO: get class of prediction

            let instanceNum = index[i].size;
            obj.scale = instanceNum / totalPix;

            let h, w;
            let left = 1e7, right = 0, up = 1e7, down = 0;
            for (let offset of index[i]) {
                h = (offset / 4) / this.imageWidth;
                w = (offset / 4) % this.imageWidth;

                left = left > w ? w : left;
                right = right < w ? w : right;
                up = up > h ? h : up;
                down = down < h ? h : down;
            }
            obj.center = [(up + down) / 2, (left + right) / 2];

            insList.push(obj);
        }

        return insList;
    }

    idx2AnnoVisualData(newAnnoData, newVisualData, pixelIndex) {
        let totalPix = this.imageHeight * this.imageWidth;
        let threshold = this.instanceThreshold != undefined ? this.instanceThreshold : 0.03;
        let instanceAnno = 0;

        // 255 non-instance; 0 background instance; 1 foreground instance
        for (let i = 0; i <= this.instanceNum; i++) {
            let pixels = pixelIndex[i];
            let instanceNum = pixels.length;
            if (i == 0) {
                instanceAnno = 255;
            }
            else {
                instanceAnno = (instanceNum / totalPix) > threshold ? 1 : 0;
                // console.log(instanceNum / totalPix, instanceAnno);
            }

            let color = this.getInsColor(instanceAnno);

            // for (let j = 0; j < pixels.length; j++) {
            //     let offset = pixels[j];
            for (let offset of pixels) {
                newAnnoData.data[offset + 0] = instanceAnno;
                newAnnoData.data[offset + 1] = instanceAnno;
                newAnnoData.data[offset + 2] = instanceAnno;
                newAnnoData.data[offset + 3] = 255;

                newVisualData.data[offset + 0] = color[0];
                newVisualData.data[offset + 1] = color[1];
                newVisualData.data[offset + 2] = color[2];
                newVisualData.data[offset + 3] = 255;
            }
        }

        return [newAnnoData, newVisualData];
    }

    // superpixel2Instance
    istSppSwitch() {
        let tempSuperData = this._getSuperpixelData();
        let tempAnnoData = this._getAnnotationData();
        let tempVisualData = this._getVisualizationData();
        let tempIndex = this.pixelIndex;

        this.superPixel.setImageData(this.backupSuperData, 0, 0);
        this.annotation.setImageData(this.backupAnnoData, 0, 0);
        this.visualization.setImageData(this.backupVisualData, 0, 0);
        this.pixelIndex = this.backupIndex;

        this.backupSuperData = tempSuperData;
        this.backupAnnoData = tempAnnoData;
        this.backupVisualData = tempVisualData;
        this.backupIndex = tempIndex;

        this._updateBoundaryLayer();
    }

    updateInstanceVisual(maskValue, isF=null) {
        let pixels = this.insPixelIndex[maskValue];
        let color = [255, 255, 255]
        if (isF == null) {   
            color = this.props.instanceList.mask2ins.get(maskValue).colorList;
        }
        else {
            color = this.getInsColor(isF ? 1 : 0);
        }
        let vData = this._getVisualizationData();

        for (let offset of pixels) {
            vData.data[offset + 0] = color[0];
            vData.data[offset + 1] = color[1];
            vData.data[offset + 2] = color[2];
            vData.data[offset + 3] = 255;
        }
        
        this.visualization.setImageData(vData, 0, 0);
    }

    initInstanceVisualBgr() {
        let insList = this.props.instanceList.insList;
        let rcmList = this.props.recommendList;
        let fgrSet = new Set(rcmList.idx2Rcm.get(this.curRecommendIdx).foreground);

        insList.forEach((ins) => {
            let mv = ins.maskValue;
            if (ins.isForeground != 255 && !fgrSet.has(mv)) {
                this.updateInstanceVisual(mv, false);
            }
        });
    }

    updateLayers() {
        this.mainLayer.children.forEach(pol => {
            pol.fullySelected = false;
            pol.visible = !this.hiddenLayers.has(pol.feature.layer);
        });
    }

    setCurrentSample(data) {
        this.currentSample = data;
        if (data) {
            this.sendMsg("currentSample", {data})
        }
    }

    /**
     * Enable/Disable polygons strokes
     */
    showStrokes(v) {
        this.visibleStrokes = v;
        if (v)
            this.setActualSelection(this.mainLayer.children);
        else
            this.clearActualSelection();
    }

    /**
     * Cancel action when pressing ESC
     */
    cancel(fullCancel) {
        if (!this.newPath) {
            this.clearActualSelection();
        }
        if (Paper.tool.cancel)
            Paper.tool.cancel(fullCancel);
    }

    delete() {
        if (this.newPath)
            this.cancel(true);
        const editor = this;
        const selectedPoints = editor.getSelectedPoints();
        let updated = false;
        if (selectedPoints.length > 0) {
            updated = true;
            // Point deletion
            // Deleting a point which is part of a triangle

            editor.unsnap();
            selectedPoints.forEach(seg => {
                seg.remove();
            });

            this.drawPointSelection();
            setTimeout(() => {
                this.setActualSelection(this.getSelectedPolygons())
            }, 0);
        } else {
            // Polygon deletion
            const selectedPolygons = editor.getSelectedPolygons();
            if (selectedPolygons.length > 0) {
                updated = true;
                selectedPolygons.forEach(p => editor.deletePolygon(p));
                //editor.deletePolygon(selectedPolygons[0]);
                this.clearActualSelection();
            }
        }
        if (updated)
            this.fullUpdate();
    }

    /**
     * Move the selected polygon to the back
     */
    moveFront() {
        if (this.selectedIntersections) {
            const sp = this.getSelectedPolygons()[0];
            const arr = Array.from(this.geom.getIntersections(sp));
            arr.sort(function (a, b) {
                if (a.isBelow(b))
                    return -1;
                else
                    return 1;
            });

            const ite = new Set(arr).values();
            let next = ite.next();
            while (next && next.value && sp.isAbove(next.value)) {
                next = ite.next();
            }
            if (next.value) {
                if (sp.feature.layer < next.value.feature.layer) {
                    sp.feature.layer = next.value.feature.layer;

                }
                sp.moveAbove(next.value);
                const i1 = this.currentSample.objects.indexOf(sp.feature);
                const i2 = this.currentSample.objects.indexOf(next.value.feature);
                const t = this.currentSample.objects[i1];
                this.currentSample.objects[i1] = this.currentSample.objects[i2];
                this.currentSample.objects[i2] = t;

                this.updateCommands();
                this.saveData();
                this.updateGeometry(false);
                this.setActualSelectionAsync(this.actualSelection);

            }
        }
    }

    /**
     * Move the selected polygon to the front
     */
    moveBack() {
        if (this.selectedIntersections) {
            const sp = this.getSelectedPolygons()[0];
            const arr = Array.from(this.geom.getIntersections(sp));
            arr.sort(function (a, b) {
                if (a.isBelow(b))
                    return 1;
                else
                    return -1;
            });

            const ite = new Set(arr).values();
            let next = ite.next();
            while (next && next.value && sp.isBelow(next.value)) {
                next = ite.next();
            }
            if (next.value) {
                if (sp.feature.layer > next.value.feature.layer)
                    sp.feature.layer = next.value.feature.layer;
                sp.moveBelow(next.value);
                const i1 = this.currentSample.objects.indexOf(sp.feature);
                const i2 = this.currentSample.objects.indexOf(next.value.feature);
                const t = this.currentSample.objects[i1];
                this.currentSample.objects[i1] = this.currentSample.objects[i2];
                this.currentSample.objects[i2] = t;

                this.updateCommands();
                this.saveData();
                this.updateGeometry(false);
                this.setActualSelectionAsync(this.actualSelection);
                //this.selectedIntersections = this.geom.getIntersections(sp);
            }
        }
    }

    fullUpdate() {
        if (this.actualSelection && this.actualSelection.length > 0)
            this.setActualSelection(this.actualSelection);
        this.saveData();
        this.updateGeometry(false);
        this.updateCommands();
    }

    undo() {
        if (this.visualization.visible == true) {
            this.superpixelUndo();
        }
        else {
            this.cancel();
            const ustate = this.undoRedo.undo();
            if (ustate) {
                this.setCurrentSample(ustate);
                this.drawAnnotations();
                this.saveData(true);
            } else {
                this.sendMsg("alert", {variant: "warning", message: "No action to undo."})
            }
        }
    }

    redo() {
        if (this.visualization.visible == true) {
            this.superpixelRedo();
        }
        else {
            this.cancel();
            const ustate = this.undoRedo.redo();
            if (ustate) {
                this.setCurrentSample(ustate);
                this.drawAnnotations();
                this.saveData(true);
            } else {
                this.sendMsg("alert", {message: "No action to redo."})
            }
        }
    }

    download() {
        $("#waiting").removeClass("display-none");
        const view = Paper.project.view;
        view.zoom = 1;
        view.center = {x: this.viewWidth / 2, y: this.viewHeight / 2};
        const jCanvas = $('#rasterCanvas');
        jCanvas.addClass("display-none");
        const canvas = jCanvas.get(0);
        canvas.width = this.imageWidth;
        canvas.height = this.imageHeight;
        Paper.project.view.viewSize = new Paper.Size(this.imageWidth, this.imageHeight);
        this.transformAllLayers(new Paper.Matrix());
        this.clearActualSelection();
        this.frontLayer.visible = false;
        this.disableComposition();
        this.enableComposition(true);
        setTimeout(() => {
            canvas.toBlob((blob) => {
                FileSaver.saveAs(blob, this.fileName.replace(/\.png$/, "_segmentation.png"));
                this.resizeCanvas();
                this.frontLayer.visible = true;
                this.disableComposition();
                this.enableComposition();
                jCanvas.removeClass("display-none");
                $("#waiting").addClass("display-none");
            });
        }, 500);
    }


    /**
     * We want to see pixels when zooming
     */
    disableSmoothing() {
        const canvas = $('#rasterCanvas').get(0);
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
    }

    /**
     * Adds the image to the raster layer when it's loaded.
     */
    imageLoaded() {
        this.filterCanvas = $("#filterCanvas").get(0);
        this.loadAnno = $("#loadAnnotation").get(0);
        this.loadVisual = $("#loadVisual").get(0);
        this.scaleCanvas = $("#scaleCanvas").get(0);

        const image = $("#sourceImage").get(0);
        // const superpixel = $("#superpixel").get(0);
        // const visual = $("#visualization").get(0);

        this.scale = 1;

        this.imageWidth = image.width;
        this.imageHeight = image.height;
        this.filterCanvas.width = this.loadAnno.width = this.loadVisual.width = this.imageWidth;
        this.filterCanvas.height = this.loadAnno.height = this.loadVisual.height = this.imageHeight;
        this.scaleCanvas.width = this.imageWidth;
        this.scaleCanvas.height = this.imageHeight;
        const ctx = this.filterCanvas.getContext("2d");

        ctx.drawImage(image, 0, 0);
        this.sourceImageData = ctx.getImageData(0, 0, this.imageWidth, this.imageHeight);

        this.superLayer.activate();
        this.annotation = new Paper.Raster(image, new Paper.Point(this.imageWidth / 2, this.imageHeight / 2));
        this.superPixel = new Paper.Raster(image, new Paper.Point(this.imageWidth / 2, this.imageHeight / 2));
        this.instanceMask = new Paper.Raster(image, new Paper.Point(this.imageWidth / 2, this.imageHeight / 2));
        this.boundary = new Paper.Raster(image, new Paper.Point(this.imageWidth / 2, this.imageHeight / 2));
        this.visualization = new Paper.Raster(image, new Paper.Point(this.imageWidth / 2, this.imageHeight / 2));
        this.scribbleMask = new Paper.Raster(image, new Paper.Point(this.imageWidth / 2, this.imageHeight / 2));

        this.annotation.onLoad = () => {
            this.annotation.visible = false;

            const ctx = this.filterCanvas.getContext("2d");
            let newImageData = ctx.createImageData(this.imageWidth, this.imageHeight);
            let index = 0;
            let offset = 0;

            for (var i = 0; i < this.imageHeight; i++) {
                for (var j = 0; j < this.imageWidth; j++) {
                    newImageData.data[offset + 0] = index;
                    newImageData.data[offset + 1] = index;
                    newImageData.data[offset + 2] = index;
                    newImageData.data[offset + 3] = 255;
                    offset += 4;
                }
            }
            this.annotation.setImageData(newImageData, 0, 0);
        };

        this.superPixel.onLoad = () => {
            // console.log("superpixel onload");
            this.superPixel.visible = false;
        };

        this.instanceMask.onLoad = () => {
            // console.log("superpixel onload");
            this.instanceMask.visible = false;
        };

        this.boundary.onLoad = () => {
            this.boundary.visible = false;

            const ctx = this.filterCanvas.getContext("2d");
            let newImageData = ctx.createImageData(this.imageWidth, this.imageHeight);
            let offset = 0;
            for (var i = 0; i < this.imageHeight; i++) {
                for (var j = 0; j < this.imageWidth; j++) {
                    newImageData.data[offset] = 255;
                    newImageData.data[offset + 1] = 255;
                    newImageData.data[offset + 2] = 255;
                    newImageData.data[offset + 3] = 0;
                    offset += 4;
                }
            }

            this.boundary.setImageData(newImageData, 0, 0);
        };

        this.visualization.onLoad = () => {
            this.visualization.visible = false;

            const ctx = this.filterCanvas.getContext("2d");
            let newImageData = ctx.createImageData(this.imageWidth, this.imageHeight);
            let offset = 0;
            for (var i = 0; i < this.imageHeight; i++) {
                for (var j = 0; j < this.imageWidth; j++) {
                    newImageData.data[offset] = 255;
                    newImageData.data[offset + 1] = 255;
                    newImageData.data[offset + 2] = 255;
                    newImageData.data[offset + 3] = 255;//this.mainLayerOpacity * 255;
                    offset += 4;
                }
            }

            this.visualization.setImageData(newImageData, 0, 0);

            this.visualization.opacity = this.mainLayerOpacity;

            // this.visualization.opacity = this.mainLayerOpacity;
        };

        this.scribbleMask.onLoad = () => {
            this.scribbleMask.visible = false;

            const ctx = this.filterCanvas.getContext("2d");
            let newImageData = ctx.createImageData(this.imageWidth, this.imageHeight);
            let offset = 0;
            for (var i = 0; i < this.imageHeight; i++) {
                for (var j = 0; j < this.imageWidth; j++) {
                    newImageData.data[offset] = 0;
                    newImageData.data[offset + 1] = 0;
                    newImageData.data[offset + 2] = 0;
                    newImageData.data[offset + 3] = 255;
                    offset += 4;
                }
            }

            this.scribbleMask.setImageData(newImageData, 0, 0);
        };

        this.rasterLayer.activate();
        this.raster = new Paper.Raster(image, new Paper.Point(this.imageWidth / 2, this.imageHeight / 2));
        this.raster.visible = false;

        this.raster.onLoad = () => {
            // Adjust the canvas layer and draw annotations when the raster is ready
            this.resizeCanvas();

            this.drawAnnotations();

            this.updateStats();

            this.raster.visible = true;
            $("#waiting").addClass("display-none");

            let fileName = decodeURIComponent(url.parse(document.URL).path.replace("/edit/", ""));
            fileName = fileName.substr(fileName.lastIndexOf('/') + 1);
            this.sendMsg("status", {message: fileName});
            this.fileName = fileName;
            this.disableSmoothing();
            this.init2Superpixel();
            this.genInsColorDic();
            this.initInstance();
            this.undoRedo.init(document.URL, this.currentSample);
            this.setCurrentSample(this.currentSample); // Workaround for late registered components
            this.floodTool.initCanvas($("#sourceImage").get(0));
            this.sendMsg("sse-image-loaded");
        };
    }

    updateStats() {
        const pointCount = this.currentSample.objects.reduce((acc, cur) => acc += cur.polygon.length, 0);
        let statLabel = this.currentSample.objects.length + " object";
        statLabel += this.currentSample.objects.length > 1 ? "s" : "";
        if (pointCount)
            statLabel += ", " + pointCount + " points";
        this.sendMsg("bottom-right-label", {message: statLabel});

        // const classCounter = new Map();
        // const layerCounter = new Map();
        // [...Array(this.activeSoc.classesCount).keys()].forEach((v, k) => classCounter.set(k, 0));
        // this.mainLayer.children.forEach((path) => {
        //     classCounter.set(path.feature.classIndex, classCounter.get(path.feature.classIndex) + 1);
        //     layerCounter.set(path.feature.layer || 0, (layerCounter.get(path.feature.layer || 0) + 1) || 1);
        // });
        // this.sendMsg("layer-object-count", {map: layerCounter});
        // classCounter.forEach((v, k) => {
        //     this.sendMsg("class-instance-count", {classIndex: k, count: v})
        // });
    }

    /**
     *
     * @param nextProps
     * @returns {boolean}
     */
    shouldComponentUpdate(nextProps) {
        if (this.currentSample && nextProps.currentSample) {
            // Happens when the data is stored on the server for the first time
            // Need to synchronize the _id stored on the server with the local data
            this.currentSample._id = nextProps.currentSample._id;
        }
        return !this.props.url ||
            !nextProps.url ||
            !nextProps.currentSample ||
            this.props.url != nextProps.url;
    }

    /**
     /**
     * Adjust underlying image with WebGL filters
     * @param filterData
     */
    updateFilter(filterData) {
        let filtered = this.sourceImageData;
        if (filterData.brightness || filterData.contrast)
            filtered = ImageFilters.BrightnessContrastPhotoshop(filtered
                , filterData.brightness, filterData.contrast);
        if (filterData.gamma != 1) {
            filtered = ImageFilters.Gamma(filtered, filterData.gamma);
        }
        if (filterData.rescale != 1) {
            filtered = ImageFilters.Rescale(filtered, filterData.rescale);
        }
        if (filterData.edges) {
            filtered = ImageFilters.Edge(filtered);
        }

        if (filterData.hue || filterData.saturation || filterData.lightness) {
            filtered = ImageFilters.HSLAdjustment(filtered,
                filterData.hue,
                filterData.saturation,
                filterData.lightness);
        }

        this.raster.setImageData(filtered, 0, 0);
        this.floodTool.setImageData(filtered);
    }

    auxiliaryLine(pt) {
        this.frontLayer.activate();
        let i = 0;

        this.clearAux();

        this.aux = [];
        let bWidth = 5 / (Paper.view.zoom * this.scaleFactor);
        let fWidth = 3 / (Paper.view.zoom * this.scaleFactor);
        let width = [bWidth, bWidth, fWidth, fWidth];
        let color = ['#000000', '#000000', '#ffffff', "#ffffff"];
        let up = new Paper.Point(pt.x, 0);
        let down = new Paper.Point(pt.x, this.imageHeight);
        let left = new Paper.Point(0, pt.y);
        let right = new Paper.Point(this.imageWidth, pt.y);
        
        this.aux.push(new Paper.Path.Line(up, down));
        this.aux.push(new Paper.Path.Line(left, right));
        this.aux.push(new Paper.Path.Line(up, down));
        this.aux.push(new Paper.Path.Line(left, right));

        for (i = 0; i < 4; i++) {
            this.aux[i].strokeColor = color[i];
            this.aux[i].strokeWidth = width[i];
        }

        this.mainLayer.activate();
    }

    clearAux() {
        let i;
        if (this.aux && this.aux.length > 1) {
            //remove
            for (i = 0; i < this.aux.length; i++) {
                this.aux[i].remove();
            }
            delete this.aux;
        }
    }

    getMaskUrl(arg) {
        return "/mask" + arg.slice(0, arg.indexOf('.')) + ".jpg";
    }

    loadMask() {
        const maskImage = $("#mask");
        maskImage.attr("src", this.getMaskUrl(this.props.imageUrl));

        const mask = $("#mask").get(0);
        const ctx = this.filterCanvas.getContext("2d");
        let oriImgData = ctx.getImageData(0, 0, this.imageWidth, this.imageHeight);

        if (mask.width === this.imageWidth && mask.height === this.imageHeight) {
            console.log("found mask data");
            ctx.drawImage(mask, 0, 0);
            setTimeout(() => {
                let maskData = ctx.getImageData(0, 0, mask.width, mask.height);
                this._updateAnnotation(this.maskPixels(maskData));

                maskImage.attr("src", '');
                Meteor.call('clearMask', this.props.imageUrl);
                ctx.putImageData(oriImgData, 0, 0);
            }, 100);
        }
        else {
            setTimeout(() => {
                this.loadMask();
            }, 1000);
        }
    }

    maskPixels(data) {
        let offset = 0;
        let pixels = [];
        for (var i = 0; i < this.imageHeight; i++) {
            for (var j = 0; j < this.imageWidth; j++) {
                // bool = data.data[offset] > this.maskThreshold * 255 ? 1 : 0;
                if (data.data[offset] > this.maskThreshold * 255) {
                    pixels.push(offset);
                }
                offset += 4;
            }
        }

        return pixels;
    }

    annotateMask(data) {

    }

    _updateVisualization() {
        const image = $("#sourceImage").get(0);
        const superpixel = $("#superpixel").get(0);
        const visual = $("#visualization").get(0);

        // const ctx = this.filterCanvas.getContext("2d");
        let annoCtx = this.loadAnno.getContext("2d");
        let visualCtx = this.loadVisual.getContext("2d");

        if (superpixel.width === image.width && superpixel.height === image.height) {
            console.log("found annotation");
            annoCtx.drawImage(superpixel, 0, 0);

            setTimeout(() => {
                let annotationData = annoCtx.getImageData(0, 0, superpixel.width, superpixel.height);
                this.annotation.setImageData(annotationData, 0, 0); 
            }, 100);
        }

        if (visual.width === image.width && visual.height === image.height) {
            console.log("found visual");
            visualCtx.drawImage(visual, 0, 0);

            setTimeout(() => {
                let visualizationData = visualCtx.getImageData(0, 0, visual.width, visual.height);
                this.visualization.setImageData(visualizationData, 0, 0); 
            }, 100);
        }
    }

    printAnno(t=1) {
        let aData = this._getAnnotationData();

        let log = {};
        let i, j, k = 0;
        for (i = 0; i < this.imageWidth; i++) {
            for (j = 0; j < this.imageHeight; j++) {
                let data = "";
                data += aData.data[k].toString();
                data += aData.data[k + 1].toString();
                data += aData.data[k + 2].toString();
                data += aData.data[k + 3].toString();
                if (data in log) {
                    log[data] += 1;
                }
                else {
                    log[data] = 1;
                }
                k += 4;
            }
        }
        console.log(log);
    }

    saveScribble(s, t) {
        const image = $("#sourceImage").get(0);
        let width = this.scribbleMask.width;
        let height = this.scribbleMask.height;
        let sData = this.scribbleMask.getImageData(new Paper.Rectangle(0, 0, width, height));
        // let visualCtx = this.loadVisual.getContext("2d");
        let scaleCtx = this.scaleCanvas.getContext("2d");

        scaleCtx.beginPath();
        scaleCtx.fillStyle = '#000000';
        scaleCtx.fillRect(0, 0, image.width, image.height);

        scaleCtx.beginPath();
        scaleCtx.strokeStyle = '#FFFFFF';
        scaleCtx.strokeWidth = 1;
        for (let i = 0; i < s.length; i++) {
            scaleCtx.moveTo(s[i][0][0] * this.scale, s[i][0][1] * this.scale);
            for (let j = 1; j < s[i].length; j++) {
                scaleCtx.lineTo(s[i][j][0] * this.scale, s[i][j][1] * this.scale);
            }
        }
        scaleCtx.stroke();
        
        // scaleCtx.setTransform(1, 0, 0, 1, 0, 0);
        // scaleCtx.scale(this.scale, this.scale);
        // scaleCtx.drawImage(this.loadVisual, 0, 0, image.width, image.height);
        let aImageData = this.scaleCanvas.toDataURL();
        // let simg = this.loadVisual.toDataURL();

        Meteor.call("saveScribble", aImageData, this.props.imageUrl, t, (err) => {console.log(err);});
        // setTimeout(() => {
        //     let aImageData = this.scaleCanvas.toDataURL();
        //     // let simg = this.loadVisual.toDataURL();

        //     Meteor.call("saveScribble", aImageData, this.props.imageUrl, t, (err) => {});
        // }, 100);
    }

    saveAnnotate() {
        let aData = this._getAnnotationData();
        let vData = this._getVisualizationData();
        const ctx = this.filterCanvas.getContext("2d");
        let oriImgData = ctx.getImageData(0, 0, this.imageWidth, this.imageHeight);

        // this.printAnno();

        ctx.putImageData(aData, 0, 0);
        let img = this.filterCanvas.toDataURL();
        Meteor.call("saveAnnotate", img, this.props.imageUrl, (err) => {});

        let offset = 0;
        for (var i = 0; i < this.imageHeight; i++) {
            for (var j = 0; j < this.imageWidth; j++) {
                vData.data[offset + 3] = 255;
                offset += 4;
            }
        }

        ctx.putImageData(vData, 0, 0);
        img = this.filterCanvas.toDataURL();
        Meteor.call("saveVisualization", img, this.props.imageUrl, (err) => {});

        ctx.putImageData(oriImgData, 0, 0);
    }

    computeEdgemap(imgData, options) {
        var data = imgData.data,
            width = imgData.width,
            height = imgData.height,
            edgeMap = new Uint8Array(imgData.data),
            boundaryCount = 0,
            foreground = options.foreground || [255, 255, 255],
            background = options.background || [0, 0, 0],
            i, j, k;
        for (i = 0; i < height; ++i) {
            for (j = 0; j < width; ++j) {
                var offset = 4 * (i * width + j),
                    index = data[4 * (i * width + j)],
                    isBoundary = (i === 0 ||
                                j === 0 ||
                                i === (height - 1) ||
                                j === (width - 1) ||
                                index !== data[4 * (i * width + j - 1)] ||
                                index !== data[4 * (i * width + j + 1)] ||
                                index !== data[4 * ((i - 1) * width + j)] ||
                                index !== data[4 * ((i + 1) * width + j)]);
                if (isBoundary) {
                    boundaryCount += 1;
                    for (k = 0; k < foreground.length; ++k)
                        edgeMap[offset + k] = foreground[k];
                }
                else {
                    for (k = 0; k < background.length; ++k)
                        edgeMap[offset + k] = background[k];
                }
            }
        }
        // console.log(boundaryCount);

        imgData.data.set(edgeMap);
        return imgData;
    }

    computeEdgemapV1(imgData, options) {
        var data = imgData.data,
            width = imgData.width,
            height = imgData.height,
            size = width * height,
            edgeMap = new Uint8Array(imgData.data),
            boundaryLog = new Uint8Array(size),
            boundaryCount = 0,
            foreground = options.foreground || [255, 255, 255],
            background = options.background || [0, 0, 0],
            i, j, k;
        for (i = 0; i < size; i++) {
            boundaryLog[i] = 0;
        }
        for (i = 0; i < height; ++i) {
            for (j = 0; j < width; ++j) {
                var offset = 4 * (i * width + j),
                    iWidth = i * width,
                    index = data[4 * (iWidth + j)],
                    isBoundary = (i === 0 ||
                                j === 0 ||
                                i === (height - 1) ||
                                j === (width - 1) ||
                                index !== data[4 * (iWidth + j - 1)] ||
                                index !== data[4 * (iWidth + j + 1)] ||
                                index !== data[4 * (iWidth - width + j)] ||
                                index !== data[4 * (iWidth + width + j)]);
                isBoundary = (isBoundary && 
                            boundaryLog[iWidth + j - 1] === 0 &&
                            boundaryLog[iWidth + j + 1] === 0 &&
                            boundaryLog[iWidth - width + j] === 0 &&
                            boundaryLog[iWidth + width + j] === 0);
                if (isBoundary) {
                    boundaryCount += 1;
                    boundaryLog[iWidth + j] = 1;
                    for (k = 0; k < foreground.length; ++k)
                        edgeMap[offset + k] = foreground[k];
                }
                else {
                    for (k = 0; k < background.length; ++k)
                        edgeMap[offset + k] = background[k];
                }
            }
        }
        // console.log(boundaryCount);

        imgData.data.set(edgeMap);
        return imgData;
    }

    computeEdgemapV2(imgData, options) {
        var data = imgData.data,
            width = imgData.width,
            height = imgData.height,
            size = width * height,
            edgeMap = new Uint8Array(imgData.data),
            boundaryLog = new Uint8Array(size * 2),
            boundaryCount = 0,
            foreground = options.foreground || [255, 255, 255],
            background = options.background || [0, 0, 0],
            i, j, k;
        for (i = 0; i < size * 2; i++) {
            boundaryLog[i] = 0;
        }
        for (i = 0; i < height; ++i) {
            for (j = 0; j < width; ++j) {
                var offset = 4 * (i * width + j),
                    iWidth = i * width,
                    index = data[4 * (iWidth + j)],
                    isBoundary = (i === 0 ||
                                j === 0 ||
                                i === (height - 1) ||
                                j === (width - 1));
                if (!isBoundary && index !== data[4 * (iWidth + j - 1)] &&
                0 === boundaryLog[2 * (iWidth + j - 1)]) {
                    isBoundary = true;
                    boundaryLog[2 * (iWidth + j)] = 1;
                }
                if (!isBoundary && index !== data[4 * (iWidth + j + 1)] &&
                0 === boundaryLog[2 * (iWidth + j + 1)]) {
                    isBoundary = true;
                    boundaryLog[2 * (iWidth + j)] = 1;
                }
                if (!isBoundary && index !== data[4 * (iWidth + j - width)] &&
                0 === boundaryLog[2 * (iWidth + j - width) + 1]) {
                    isBoundary = true;
                    boundaryLog[2 * (iWidth + j) + 1] = 1;
                }   
                if (!isBoundary && index !== data[4 * (iWidth + j + width)] &&
                0 === boundaryLog[2 * (iWidth + j + width) + 1]) {
                    isBoundary = true;
                    boundaryLog[2 * (iWidth + j) + 1] = 1;
                }

                if (isBoundary) {
                    boundaryCount += 1;
                    for (k = 0; k < foreground.length; ++k)
                        edgeMap[offset + k] = foreground[k];
                }
                else {
                    for (k = 0; k < background.length; ++k)
                        edgeMap[offset + k] = background[k];
                }
            }
        }
        // console.log(boundaryCount);

        imgData.data.set(edgeMap);
        return imgData;
    }

    // Run superpixel segmentation.
    resetSuperpixels(options) {
        options = options || {};
        // this.layers.superpixel.copy(this.layers.image);
        let imageData = this.sourceImageData;
        // this.superPixel.setImageData(imageData, 0, 0);
        this.segmentation = segmentation(imageData, options);
        this._updateSuperpixels();
    }

    // Adjust the superpixel resolution.
    finer() {
        this.segmentation.finer();
        this._updateSuperpixels();
        return this;
    }

    // Adjust the superpixel resolution.
    coarser() {
        this.segmentation.coarser();
        this._updateSuperpixels();
        return this;
    }

    superpixelUndo() {
        if (this.currentHistoryRecord < 0) {
            return false;
        }
        let record = this.history[this.currentHistoryRecord];
        this.currentHistoryRecord -= 1;
        this._fillPixels(record.pixels, record.prev, record.insPrev);
    }

    superpixelRedo() {
        if (this.currentHistoryRecord >= this.history.length - 1) {
            return false;
        }
        this.currentHistoryRecord += 1;
        let record = this.history[this.currentHistoryRecord];
        this._fillPixels(record.pixels, record.next, record.insNext);
    }

    _getAnnotationData() {
        let width = this.annotation.width;
        let height = this.annotation.height;
        return this.annotation.getImageData(new Paper.Rectangle(0, 0, width, height));
    }

    _getSuperpixelData() {
        let width = this.superPixel.width;
        let height = this.superPixel.height;
        return this.superPixel.getImageData(new Paper.Rectangle(0, 0, width, height));
    }

    _getVisualizationData() {
        let width = this.visualization.width;
        let height = this.visualization.height;
        return this.visualization.getImageData(new Paper.Rectangle(0, 0, width, height));
    }

    _getInstanceMaskData() {
        let width = this.visualization.width;
        let height = this.visualization.height;
        return this.instanceMask.getImageData(new Paper.Rectangle(0, 0, width, height));
    }

    _updateVisualizationOpacity() {
        let vData = this._getVisualizationData();
        let alpha = this.mainLayerOpacity * 255;
        let offset = 0;

        for (var i = 0; i < this.imageHeight; i++) {
            for (var j = 0; j < this.imageWidth; j++) {
                vData.data[offset + 3] = alpha;
                offset += 4;
            }
        }
        this.visualization.setImageData(vData, 0, 0);
    }

    _updateBoundaryLayer() {
        // let width = this.superPixel.width;
        // let height = this.superPixel.height;
        // let imgData = this.superPixel.getImageData(new Paper.Rectangle(0, 0, width, height));
        let imgData1 = this._getSuperpixelData();
        let imgData2 = this._getSuperpixelData();

        // Altered
        this.boundaryDataV1 = this.computeEdgemapV1(imgData1, 
            {
                foreground: [255, 255, 255, 185],
                background: [255, 255, 255, 0]
            }
        );
        // Original
        this.boundaryDataV2 = this.computeEdgemapV2(imgData2, 
            {
                foreground: [255, 255, 255, 185],
                background: [255, 255, 255, 0]
            }
        );
        this.boundary.setImageData(this.boundaryDataV2, 0, 0);
        // this.boundaryState = 0;
    }
    
    _updateSuperpixels() {
        this.superPixel.setImageData(this.segmentation.result, 0, 0);
        let data = this._getSuperpixelData().data;
        this.pixelIndex = this._createPixelIndex(data, this.segmentation.result.numSegments);
        this._updateBoundaryLayer();
        this.superPixel.opacity = 0;
    }

    _updateAnnotation(pixels, index=null) {
        if (this.isInstance !== null && this.isInstance && index == 0) {
            return true;
        }
        // labels = (typeof labels === "object") ? labels : this._fillArray(new Int32Array(pixels.length), labels);
        let labels = this._fillArray(new Int32Array(pixels.length), this.activeClassIndex);
        let updates = this._getDifferentialUpdates(pixels, labels);
        if (updates.pixels.length === 0) {
            return true;
        }
        this._updateHistory(updates);
        this._fillPixels(updates.pixels, updates.next, updates.insNext);
    }

    _fillArray(array, value) {
        for (var i = 0; i < array.length; ++i)
            array[i] = value;
        return array;
    }

    _updateHistory(updates) {
        this.history = this.history.slice(0, this.currentHistoryRecord + 1);
        this.history.push(updates);
        if (this.history.length > this.maxHistoryRecord) {
            this.history = this.history.slice(1, this.history.length);
        }
        else{
            ++this.currentHistoryRecord;
        }
    }

    _getDifferentialUpdates(pixels) {
        let curLabel = parseInt(this.activeClassIndex);
        let curIns = parseInt(this.activeInstanceIndex);

        let aData = this._getAnnotationData();
        let iData = this._getInstanceMaskData().data;

        let updates = {pixels : [], 
            prev : [], next : [],
            insPrev: [], insNext : []};

        // for (let i = 0; i < pixels.length; i++) {
        //     let offset = pixels[i]
        for (let offset of pixels) {
            let label = aData.data[offset];
            let insLabel = iData[offset] | 
                (iData[offset + 1] << 8) | 
                (iData[offset + 2] << 16);

            if (label !== curLabel || insLabel !== curIns) {
                updates.pixels.push(offset);
                updates.prev.push(label);
                updates.next.push(curLabel);
                updates.insPrev.push(insLabel);
                updates.insNext.push(curIns);
            }
        }

        return updates;
    }

    instanceHighlight(index) {
        let pixels = this.insPixelIndex[index];
        let vData = this._getVisualizationData();

        // var i, offset;
        // for (i = 0; i < pixels.length; ++i) {
            // offset = pixels[i];
        for (let offset of pixels) {
            vData.data[offset + 3] = 128;
        }

        this.visualization.setImageData(vData, 0, 0);
    }

    instanceDeHighlight(index) {
        let pixels = this.insPixelIndex[index];
        let vData = this._getVisualizationData();

        // var i, offset;
        // for (i = 0; i < pixels.length; ++i) {
        //     offset = pixels[i];
        for (let offset of pixels) {
            vData.data[offset + 3] = 255;
        }

        this.visualization.setImageData(vData, 0, 0);
    }

    _updateHighlight(index) {
        if (this.currentSuperpixelIndex !== null && this.currentSuperpixelIndex === index) {
            return false;
        }
        this.currentSuperpixelIndex = index;
        let pixels = this.pixelIndex[index];
        let vData = this._getVisualizationData();
        var i, offset;
        if (this.currentPixels !== null) {
            // for (i = 0; i < this.currentPixels.length; ++i) {
            //     offset = this.currentPixels[i];
            for (let offset of this.currentPixels) {
                vData.data[offset + 3] = 255;
            }
        }
        this.currentPixels = pixels;
        if (this.currentPixels !== null) {
            // for (i = 0; i < pixels.length; ++i) {
            //     offset = pixels[i];
            for (let offset of this.currentPixels) {
                vData.data[offset + 3] = 128;
            }
        }

        this.visualization.setImageData(vData, 0, 0);
    }

    _fillPixels(pixels, labels, insLabels) {
        // console.log("current label index:", labels[0]);
        // console.log("number to change:", pixels.length);
        let i;
        let annotationData = this._getAnnotationData();
        let visualizationData = this._getVisualizationData();
        let instanceData = this._getInstanceMaskData();

        for (i = 0; i < pixels.length; i++) {
            let offset = pixels[i];
            let index = labels[i];
            let ins = insLabels[i]
            // console.log(typeof(this.activeClassIndex), typeof(index));
            let color = this.activeSoc.colorForIndexAsRGBArray(index);

            annotationData.data[offset + 0] = index;
            annotationData.data[offset + 1] = index;
            annotationData.data[offset + 2] = index;
            annotationData.data[offset + 3] = 255;

            visualizationData.data[offset + 0] = color[0] * 255;
            visualizationData.data[offset + 1] = color[1] * 255;
            visualizationData.data[offset + 2] = color[2] * 255;
            visualizationData.data[offset + 3] = 255;

            let prev = instanceData.data[offset + 0] |
                (instanceData.data[offset + 1] << 8) |
                (instanceData.data[offset + 2] << 16);
            this.insPixelIndex[prev].delete(offset);
            this.insPixelIndex[ins].add(offset);

            instanceData.data[offset + 0] = ins & 255;
            instanceData.data[offset + 1] = (ins >>> 8) & 255;
            instanceData.data[offset + 2] = (ins >>> 16) & 255;
            instanceData.data[offset + 3] = 255;
        }

        this.annotation.setImageData(annotationData, 0, 0);
        this.visualization.setImageData(visualizationData, 0, 0);
        this.instanceMask.setImageData(instanceData, 0, 0);

        // this.printAnno();
    } 

    _createPixelIndex(data, numSegments) {
        var pixelIndex = new Array(numSegments);
        var i = 0;
        for (i = 0; i < numSegments; ++i)
            pixelIndex[i] = new Set();
        for (i = 0; i < data.length; i += 4) {
            var index = data[i] | (data[i + 1] << 8) | (data[i + 2] << 16);
            pixelIndex[index].add(i);
        }
        this.currentPixels = null;
        return pixelIndex;
    }

    _getClickOffset(pos) {
        var x = Math.floor(pos.x),
            y = Math.floor(pos.y);
        return 4 * (y * this.imageWidth + x);
    }

    render() {
        return (
            <canvas id="rasterCanvas" className="absoluteTopLeftZeroW100H100"></canvas>
        );
    }

    cloningDataFunction(data) {

        const res = {};
        res.url = data.url;
        res.socName = data.socName;
        if (data.firstEditDate)
            res.firstEditDate = new Date(data.firstEditDate.getTime());
        if (data.lastEditDate)
            res.lastEditDate = new Date(data.lastEditDate.getTime());
        res._id = data._id;
        res.folder = data.folder;
        res.objects = [];
        res.tags = (data.tags || []).concat();
        let obj;
        data.objects.forEach(o => {

            obj = {
                label: o.label,
                classIndex: o.classIndex,
                polygon: []
            };
            o.polygon.forEach(pt => {
                obj.polygon.push({x: pt.x, y: pt.y});
            });
            res.objects.push(obj);
        });
        return res;
    }
}
