import { map } from "jquery";
import ColorScheme from "color-scheme";

/*
Instance

instance_index / mask_value
instance_class
is_foreground

*/
export default class SetOfInstance {
    constructor(insList) {
        this.insList = new Array();
        this.cls2ins = new Map();
        this.mask2ins = new Map();
        
        this.genInsColorDic();
        this.addIns(insList);
    }

    addIns(insList) {
        if (typeof insList == "object") {
            insList.forEach(ins => {
                this.addCls2Ins(ins.class, ins);
                this.mask2ins.set(ins.maskValue, ins);
                ins.colorStr = this.getInsColorStr(ins.isForeground);
                ins.colorList = this.getInsColorList(ins.isForeground);
            });
            this.insList = this.insList.concat(insList);
        }
        console.log(typeof insList);
    }

    addCls2Ins(cls, ins) {
        if (this.cls2ins.has(cls)) {
            let s = this.cls2ins.get(cls);
            s.add(ins);
            this.cls2ins.set(cls, s);
        }
        else {
            this.cls2ins.set(cls, new Set([ins]));
        }
    }

    changeClass(mask, cls) {
        let ins = this.mask2ins.get(mask);
        this.cls2ins.get(ins.class).delete(ins);
        ins.class = cls.classIndex;
        ins.className = cls.label;
        if (this.cls2ins.has(cls.classIndex)) {
            this.cls2ins.get(ins.class).add(ins);
        }
        else {
            this.cls2ins.set(cls.classIndex, new Set([ins]));
        }
    }

    changeForeground(mask, isF) {
        let ins = this.mask2ins.get(mask);
        ins.isForeground = isF;
        ins.colorList = this.getInsColorList(isF);
        ins.colorStr = this.getInsColorStr(isF);
    }

    changeMask(idx, maskIdx, offset, update) {
        let ins = this.mask2ins.get(idx);

        let curIdx = ins.activateMaskIdx;
        let mask = ins.maskList.idx2Mask.get(curIdx);
        update.forEach((value, key) => {
            if (mask[key] != undefined) {
                mask[key] = value;
                // console.log(idx, maskIdx, key, value);
            }
        })

        ins.activateMaskIdx = maskIdx;
        // ins.maskList.idx2Mask.get(maskIdx).offset = offset;
    }

    newMask(idx, mask, offset) {
        let ins = this.mask2ins.get(idx);
        let curIdx = ins.activateMaskIdx;
        ins.maskList.idx2Mask.get(curIdx).offset = offset;

        let newIdx = ins.maskList.curMaxIdx;
        ins.maskList.addMask([mask]);

        return ins.maskList.idx2Mask.get(newIdx);
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
        bgrInsColor = bgrInsColor.map(c => "#" + c);

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
        fgrInsColor = fgrInsColor.map(c => "#" + c);

        // 255 non-instance; 0 background instance; 1 foreground instance
        this.insColorDicList = {255 : [[255, 255, 255]],
            0 : bgrInsColorDec,
            1 : fgrInsColorDec
        }
        this.insColorDicStr = {255 : ["#FFFFFF"],
            0 : bgrInsColor,
            1 : fgrInsColor
        }
    }

    getInsColorStr(isF) {
        if (typeof isF == "boolean"){
            isF = isF ? 1 : 0;
        }
        // let i = isF ? 1 : 0;

        let colorList = this.insColorDicStr[isF];
        return colorList[Math.floor(Math.random() * colorList.length)];
    }

    getInsColorList(isF) {
        if (typeof isF == "boolean"){
            isF = isF ? 1 : 0;
        }
        // let i = isF ? 1 : 0;

        let colorList = this.insColorDicList[isF];
        return colorList[Math.floor(Math.random() * colorList.length)];
    }
}