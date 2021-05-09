import React from 'react';


import SseClassChooser from "../../common/SseClassChooser";
import SseInstanceChooser from "../../common/SseInstanceChooser";

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
        
        let insList = new SetOfInstance();
        this.state.instanceList = insList;

        console.log(this.state.instanceList);
        
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
        this.onMsg("addInstanceList", (arg) => {
            let insList = this.state.instanceList;
            insList.addIns(arg.list);
            console.log(insList.insList);

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
        return (
            <div className="w100 h100">
                <MuiThemeProvider theme={new SseTheme().theme}>
                    <div className="w100 h100 editor">
                        <div className="vflex w100 h100 box1">
                            <SseToolbar2d onToolChange={this.onToolChange.bind(this)} />
                            <div className="hflex grow box2 relative h0">
                                {ready ? <SseInstanceChooser instanceList={this.state.instanceList}/> : null}
                                {ready ? <SseClassChooser classesSets={this.classesSets}/> : null}
                                <div id="canvasContainer" className="grow relative">
                                    {ready
                                        ? <SseEditor2d
                                            imageUrl={this.props.imageUrl}
                                            instanceList={this.instanceList}/>
                                        : null}
                                    <div id="waiting"
                                         className="hflex flex-align-items-center absolute w100 h100">
                                        <div className="grow vflex flex-align-items-center">
                                            <Autorenew/>
                                        </div>
                                    </div>

                                </div>
                                <SseSliderPanel 
                                    imageUrl={this.props.imageUrl}
                                    currentTool={this.state.currentTool}/>
                            </div>
                            <SseBottomBar/>
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

