import React from 'react';
import {Button, Dialog, IconButton} from '@material-ui/core';
import MDI, {ChevronRight, Eye, EyeOff} from 'mdi-material-ui';
import SseGlobals from './SseGlobals';
import SseToolbar from "./SseToolbar";
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogTitle from '@material-ui/core/DialogTitle';

export default class SseParsingClassChooser extends SseToolbar {

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
            soc: this.classesSetByName.get("HumanParsing"),
            activeClassIndex: 0
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
        this.onMsg("parsingClassSelection", (arg) => {
            this.setState({activeClassIndex: arg.descriptor.classIndex});
        });

        this.onMsg("currentSample", (arg) => {
            if (arg.data.socName)
                this.changeClassesSet(arg.data.socName);
        });

        this.onMsg("editor-ready", (arg) => {
            if (arg && arg.value && arg.value.socName)
                this.sendMsg("active-soc", {value: this.classesSetByName.get(arg.value.socName)});
            else
                this.sendMsg("active-soc", {value: this.classesSets[0]});
        });

        this.onMsg("active-soc", (arg) => {
            this.soc = arg.value;
            this.displayAll();

        });

        this.onMsg("active-soc-name", (arg) => {
            const value = this.classesSetByName.get(arg.value);
            this.sendMsg("active-soc", {value});
        });

    }

    displayAll() {
        if (this.state) {
            Object.keys(this.state).forEach(k => {
                if (k.toString().startsWith("mute") || k.toString().startsWith("solo")) {
                    delete this.state[k];
                }
            })
        }
    }

    toggleButton(prop, idx) {
        const o = {};
        const p = this.state[prop + idx] || false;
        o[prop + idx] = !p;
        this.setState(o);
    }

    muteOrSolo(name, argument, idx) {
        if (this.state.counters[argument.classIndex] ||
            (!this.state.counters[argument.classIndex] && this.state[name + idx])) {
            this.toggleButton(name, idx);
            this.sendMsg(name, argument);
        }
    }

    changeClassesSet(name) {
        const newSoc = this.classesSetByName.get(name);
        const usedClasses = Object.keys(this.state.counters).filter(x => this.state.counters[x] > 0);
        const missing = [];
        usedClasses.forEach(x => {
            if (!newSoc.labels.has(x)) {
                missing.push(x);
            }
        });
        //debugger;
        const t = this.state.counters;
        let maxClassIndex = Math.max(...Object.keys(t).filter(k => t[k] > 0));

        if (newSoc.descriptors.length >= maxClassIndex) {
            this.setState({
                soc: newSoc,
                classes: newSoc.descriptors,
                mode: "normal",
                activeClassIndex: 0
            });
            this.sendMsg("active-soc", {value: newSoc});

        }
        else
            this.sendMsg("alert",
                {
                    variant: "error",
                    forceCloseMessage: "dismiss-not-enough-classes",
                    message: "This set of classes only supports " + newSoc.descriptors.length
                    + " different classes (index from 0 to " + (newSoc.descriptors.length - 1) +
                    ") but the current maximum class index for your data is " + maxClassIndex
                });
    }

    shouldComponentUpdate(np, ns) {
        if (this.state.mode == "set-chooser" && ns.mode == "normal")
            this.sendMsg("dismiss-not-enough-classes");
        return true;
    }

    renderDialog() {
        return (<Dialog open={this.state.mode == "set-chooser"}>
            <DialogTitle>Sets of Object Classes</DialogTitle>
            <DialogContent>
                <div className="vflex">
                    <span>Choose which set to use:</span>
                    <div className="hflex w100 wrap">
                        {this.classesSets.map((cset) => (
                            <Button
                                onClick={(e) => this.changeClassesSet(cset.name)}
                                key={cset.name}>{cset.name + (cset.name == this.state.soc.name ? " (current)" : "")}</Button>
                        ))
                        }
                    </div>
                </div>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => {
                    this.setState({mode: "normal"})
                }} color="primary">
                    Cancel
                </Button>
            </DialogActions>
        </Dialog>)
    }

    initSetChange() {
        this.setState({mode: "set-chooser"});
    }

    render() {
        const smallIconStyle = {width: "25px", height: "25px", color: "darkgray"};
        const smallIconSelected = {width: "25px", height: "25px", color: "red"};
        return (

            <div className="sse-class-chooser vflex scroller"
                 style={{"padding": "5px 5px 0 0"}}>
                {this.state.soc.descriptors.map((objDesc, idx) => {
                    const isSelected = objDesc.classIndex == this.state.activeClassIndex;
                    const buttonColor = objDesc.color;
                    // const buttonColor = "#3F3795";
                    return <div className="hflex flex-align-items-center no-shrink" key={objDesc.label}
                        style={{"height" : "30px"}}>
                        <ChevronRight className="chevron" color={isSelected ? "primary" : "disabled"}/>
                        <Button className="class-button"
                                onDoubleClick={() => this.sendMsg("class-multi-select", {name: objDesc.label})}
                                onClick={() => {
                                    this.sendMsg('parsingClassSelection', {descriptor: objDesc});
                                }}
                                style={
                                    {
                                        "width": "100%",
                                        "minHeight": "26px",
                                        "margin": "1px",
                                        "backgroundColor": buttonColor,
                                        "color": SseGlobals.computeTextColor(buttonColor),
                                        "border": isSelected ? "solid 2px #ffffff" : "solid 1px black",
                                        "padding": "0 3px"
                                    }}>
                            <div
                                className="hflex flex-align-items-center w100">
                                {this.getIcon(objDesc)}{objDesc.label}
                            </div>
                            <sup>{this.state.counters[objDesc.classIndex] > 0 ? this.state.counters[objDesc.classIndex] : ""}</sup>
                        </Button>
                    </div>
                })}
                <Button onClick={() => this.initSetChange()}>Classes Sets</Button>
                {this.renderDialog()}
            </div>
        );
    }
}