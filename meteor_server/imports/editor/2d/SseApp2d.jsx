import React from 'react';


import SseClassChooser from "../../common/SseClassChooser";
import SseInstanceChooser from "../../common/SseInstanceChooser";
import SseRecommendChooser from "../../common/SseRecommendChooser";
import SseInsMaskChooser from "../../common/SseInsMaskChooser";

import SseEditor2d from "./SseEditor2d";
import SseSliderPanel from "./SseSliderPanel";
import {darkBaseTheme, MuiThemeProvider} from '@material-ui/core/styles';

import SseGlobals from "../../common/SseGlobals";
import {Meteor} from "meteor/meteor";
import SseSnackbar from "../../common/SsePopup";
import SseMsg from "../../common/SseMsg";
import {withTracker} from 'meteor/react-meteor-data';
import SseBottomBar from "../../common/SseBottomBar";

import SseConfirmationDialog from "../../common/SseConfirmationDialog";
import {Autorenew} from 'mdi-material-ui';
import SseTheme from "../../common/SseTheme";
import SseToolbar2d from "./SseToolbar2d";
import SseSetOfClasses from "../../common/SseSetOfClasses";
import SetOfInstance from "../../common/SseSetOfInstance";
import SetOfRecommend from "../../common/SseSetOfRecommend";
import SseTooltips2d from "./SseTooltips2d";
import tippy from "tippy.js";
import $ from "jquery";

export default class SseApp2d extends React.Component {

    constructor() {
        super();
        SseMsg.register(this);

        this.state = {};

        this.state.imageReady = false;
        this.state.classesReady = false;
        this.state.changeCls = false;
        this.state.isRecommend = true;
        this.state.instanceReady = false;

        let insList = new SetOfInstance();
        this.state.instanceList = insList;
        let rcmList = new SetOfRecommend();
        this.state.recommendList = rcmList;

        this.state.curInstance = {maskList : []};

        console.log(this.state.instanceList);
        console.log(this.state.recommendList);
        
        this.classesSets = [];
        Meteor.call("getClassesSets", (err, res) => {
            this.classesSets = res.map(cset => new SseSetOfClasses(cset));
            this.setState({classesReady: true});
        });
        Meteor.call('read-list', (err, res) => {
            Session.set('result', res);
        });
    }

    setupTooltips() {
        tippy('[title]', {
            theme: 'sse',
            arrow: true,
            delay: [800, 0]
        })
    }

    componentDidUpdate() {
        this.setupTooltips();
    }

    messages() {
        this.onMsg("editor-ready", (arg) => {
            this.sendMsg("active-soc", {value: this.classesSets[0]});
        });

        this.onMsg("instanceReady", (arg) => {
            this.setState({instanceReady: true});
        });

        this.onMsg("genRecommend", (arg) => {
            let rcmList = this.state.recommendList;
            rcmList.addRcm(arg.list);
            
            this.setState({recommendList : rcmList});
        });
        
        this.onMsg("editRecommend", (arg) => {
            let insList = this.state.instanceList;
            let rcm = this.state.recommendList.idx2Rcm.get(arg.rcmIdx);
            // console.log(rcm.foreground);
            for (let i = 0; i < rcm.foreground.length; i++) {
                insList.changeForeground(rcm.foreground[i], true);
            }
            
            this.setState({isRecommend : false, instanceList : insList});
            // this.sendMsg("componentChange");
        });

        this.onMsg("addInstanceList", (arg) => {
            let insList = this.state.instanceList;
            insList.addIns(arg.list);
            console.log(insList.insList);

            if (arg.isInit) {
                this.setState({curInstance : insList.mask2ins.get(0)});
            }
            else {
                let ins = insList.mask2ins.get(arg.list[0].maskValue);
                console.log(ins);
                this.sendMsg("instanceSelection", {instance: ins});
            }

            this.setState({instanceList : insList});
        });

        this.onMsg("instanceCheckbox", (arg) => {
            let insList = this.state.instanceList;
            insList.changeForeground(arg.ins, arg.isF);

            this.setState({instanceList : insList});
        });

        this.onMsg("instanceSelection", (arg) => {
            // this.setState({curInstanceIndex : arg.instance.maskValue});
            this.setState({curInstance : arg.instance});
        })

        this.onMsg("classSelection", (arg) => {
            let insList = this.state.instanceList;
            insList.changeClass(this.state.curInstance.maskValue, arg.descriptor);

            this.setState({instanceList : insList});
        });

        this.onMsg("changeClass", (arg) => {
            let cc = !this.state.changeCls;

            this.setState({curInstance : arg.instance, changeCls : cc});
        });

        this.onMsg("newInsMaskOffset", (arg) => {
            let insList = this.state.instanceList;
            let mask = insList.newMask(this.state.curInstance.maskValue, arg.mask, arg.offset);

            this.setState({instanceList : insList});
            this.sendMsg('insMaskSelection', {mask: mask});
        });

        this.onMsg("insMaskSelectionOffset", (arg) => {
            let insList = this.state.instanceList;
            insList.changeMask(this.state.curInstance.maskValue, arg.mask.idx, arg.offset);

            this.setState({instanceList : insList});
        });
    }

    onToolChange(name) {
        this.setState({currentTool : name});
    }

    componentDidMount() {
        this.setupTooltips();
        const sourceImage = $("#sourceImage");
        sourceImage.on("load", () => {
                this.setState({imageReady: true});
        });
        sourceImage.attr("src", SseGlobals.getFileUrl(this.props.imageUrl));

        const superpixel = $("#superpixel");
        superpixel.attr("src", SseGlobals.getSuperpixelUrl(this.props.imageUrl));

        const visualization = $("#visualization");
        visualization.attr("src", SseGlobals.getVisualizationUrl(this.props.imageUrl));

        const instance = $("#instance");
        instance.attr("src", SseGlobals.getInstanceUrl(this.props.imageUrl));

        this.setState({currentTool : "null"});

        this.messages();
    }

    componentWillUnmount() {
        $("#sourceImage").off();
    }

    render() {
        const ready = this.state.imageReady && this.state.classesReady;
        const rcmStage = ready && this.state.isRecommend;
        const editStage = ready && !this.state.isRecommend;
        return (
            <div className="w100 h100">
                <MuiThemeProvider theme={new SseTheme().theme}>
                    <div className="w100 h100 editor">
                        <div className="vflex w100 h100 box1">
                            {editStage
                                ? <SseToolbar2d onToolChange={this.onToolChange.bind(this)} />
                                : null}
                            <div className="hflex grow box2 relative h0">
                                {rcmStage 
                                    ? <SseRecommendChooser 
                                        recommendList={this.state.recommendList}
                                        instanceReady={this.state.instanceReady}/> 
                                    : null}
                                {editStage ? <SseInstanceChooser instanceList={this.state.instanceList}/> : null}
                                {editStage && this.state.changeCls 
                                    ? <SseClassChooser 
                                    classesSets={this.classesSets}
                                    classIndex={this.state.curInstance}/> 
                                    : null}
                                {editStage ? <SseInsMaskChooser instance={this.state.curInstance}/> : null}
                                <div id="canvasContainer" className="grow relative">
                                    {ready
                                        ? <SseEditor2d
                                            imageUrl={this.props.imageUrl}
                                            instanceList={this.state.instanceList}
                                            recommendList={this.state.recommendList}/>
                                        : null}
                                    <div id="waiting"
                                         className="hflex flex-align-items-center absolute w100 h100">
                                        <div className="grow vflex flex-align-items-center">
                                            <Autorenew/>
                                        </div>
                                    </div>

                                </div>
                                {editStage
                                    ? <SseSliderPanel 
                                    imageUrl={this.props.imageUrl}
                                    currentTool={this.state.currentTool}/> 
                                    : null}
                            </div>
                            {/* <SseBottomBar/> */}
                        </div>
                        <SseSnackbar/>
                        <SseConfirmationDialog
                            startMessage="reset-start" endMessage="reset-end"
                            title="Segmentation Reset"
                            text="This will delete all existing polygons and tags, are you sure?"></SseConfirmationDialog>
                    </div>
                    <SseTooltips2d/>
                </MuiThemeProvider>
            </div>
        );
    }
}

