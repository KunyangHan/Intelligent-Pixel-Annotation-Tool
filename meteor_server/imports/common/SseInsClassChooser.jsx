import React from 'react';
import {Button, Dialog, IconButton} from '@material-ui/core';
import MDI, {ChevronRight, Eye, EyeOff} from 'mdi-material-ui';
import SseGlobals from './SseGlobals';
import SseToolbar from "./SseToolbar";
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogTitle from '@material-ui/core/DialogTitle';

export default class SseInsClassChooser extends SseToolbar {

    constructor(props) {
        super();
        this.pendingState.counters = {};
        this.classesSets = props.classesSets;
        this.classesSetByName = new Map();
        this.classesSets.map(cset => {
            this.classesSetByName.set(cset.name, cset)
        });
        console.log("class chooser construct", props.classIndex);
        this.state = {
            counters: {},
            soc: this.classesSets[0],
            activeClassIndex: props.classIndex.class
        };
    }

    getIcon(objDesc) {
        if (MDI[objDesc.icon]) {
            return MDI[objDesc.icon]();
        } else {
            return MDI.Label();
        }
    }

    messages() {
        this.onMsg("instanceSelection", (arg) => {
            this.setState({activeClassIndex : arg.instance.class});
        });

        this.onMsg("insClassSelection", (arg) => {
            this.setState({activeClassIndex: arg.descriptor.classIndex});
        });
    }

    render() {
        const smallIconStyle = {width: "25px", height: "25px", color: "darkgray"};
        const smallIconSelected = {width: "25px", height: "25px", color: "red"};
        return (

            <div className="sse-class-chooser vflex scroller"
                 style={{"padding": "5px 5px 0 0"}}>
                {this.state.soc.descriptors.map((objDesc, idx) => {
                    const isSelected = objDesc.classIndex == this.state.activeClassIndex;
                    // const buttonColor = objDesc.color;
                    const buttonColor = "#3F3795";
                    return <div className="hflex flex-align-items-center no-shrink" key={objDesc.label}>
                        <ChevronRight className="chevron" color={isSelected ? "primary" : "disabled"}/>
                        <Button className="class-button"
                                onDoubleClick={() => this.sendMsg("class-multi-select", {name: objDesc.label})}
                                onClick={() => {
                                    this.sendMsg('insClassSelection', {descriptor: objDesc});
                                }}
                                style={
                                    {
                                        "width": "100%",
                                        "minHeight": "20px",
                                        "margin": "1px",
                                        "backgroundColor": buttonColor,
                                        "color": SseGlobals.computeTextColor(buttonColor),
                                        "border": isSelected ? "solid 1px #ffffff" : "solid 1px black",
                                        "padding": "0 3px"
                                    }}>
                            <div
                                className="hflex flex-align-items-center w100">
                                {this.getIcon(objDesc)}{objDesc.label}
                            </div>
                        </Button>
                    </div>
                })}
            </div>
        );
    }
}