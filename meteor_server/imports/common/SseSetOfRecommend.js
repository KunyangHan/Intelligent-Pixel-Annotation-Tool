import { map } from "jquery";
import ColorScheme from "color-scheme";

/*
Instance

instance_index / mask_value
instance_class
is_foreground

*/
export default class SetOfRecommend {
    constructor(rcmList) {
        this.rcmList = new Array();
        this.idx2Rcm = new Map();

        this.addRcm(rcmList);
    }

    addRcm(rcmList) {
        if (typeof rcmList == "object") {
            rcmList.forEach(rcm => {
                this.idx2Rcm.set(rcm.idx, rcm);
            });
            this.rcmList = this.rcmList.concat(rcmList);
        }
        console.log(typeof rcmList);
    }
}