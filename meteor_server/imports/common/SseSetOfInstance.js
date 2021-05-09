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
        this.insColorDicStr = {255 : [[255, 255, 255]],
            0 : bgrInsColor,
            1 : fgrInsColor
        }
    }

    getInsColorStr(isF) {
        let i = isF ? 1 : 0;

        let colorList = this.insColorDicStr[i];
        return colorList[Math.floor(Math.random() * colorList.length)];
    }

    getInsColorList(isF) {
        let i = isF ? 1 : 0;

        let colorList = this.insColorDicList[i];
        return colorList[Math.floor(Math.random() * colorList.length)];
    }
}