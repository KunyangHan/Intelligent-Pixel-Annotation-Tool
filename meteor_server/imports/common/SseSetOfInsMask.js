import { map } from "jquery";
import ColorScheme from "color-scheme";

/*
Instance Mask

image data
offset
name
idx

*/
export default class SetOfInsMask {
    constructor(maskList) {
        this.maskList = new Array();
        this.idx2Mask = new Map();
        this.curMaxIdx = 0;

        this.addMask(maskList);
    }

    addMask(maskList) {
        if (typeof maskList == "object") {
            maskList.forEach(mask => {
                mask.idx = this.curMaxIdx;
                this.idx2Mask.set(mask.idx, mask);

                this.curMaxIdx += 1;
            });
            this.maskList = this.maskList.concat(maskList);
        }
    }
}