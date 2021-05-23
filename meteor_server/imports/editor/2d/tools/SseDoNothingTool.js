import SseTool from "./SseTool";
import Paper from "paper";
import SseGlobals from "../../../common/SseGlobals";


export default class SseDoNothingTool extends SseTool {

    constructor(editor) {
        super(editor);
        this.bindCallbacks();
    }

    onKeyDown(event) {
    }

    cancel() {
    }

    onMouseDown(event) {
        if (!this.isLeftButton(event) || event.modifiers.space)
            return super.viewDown(event);
    }

    onMouseDrag(event) {
        if (!this.isLeftButton(event) || event.modifiers.space)
            return super.viewDrag(event);
    }

    onMouseMove(event) {
    }
 
    onMouseUp(event) {
        if (!this.isLeftButton(event) || event.modifiers.space)
            return super.viewUp(event);
    }
}