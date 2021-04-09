import {Meteor} from "meteor/meteor";
import shell from "shelljs";
import serveStatic from "serve-static";
import bodyParser from "body-parser";
import {createWriteStream, lstatSync, readdirSync, readFile, readFileSync} from "fs";
import {basename, extname, join} from "path";
import configurationFile from "./config";

Meteor.startup(() => {

const {imagesFolder, annotateFolder, visualizationFolder, maskFolder} = configurationFile;
    WebApp.connectHandlers.use("/file", serveStatic(imagesFolder, {fallthrough: false}));
    WebApp.connectHandlers.use("/annotate", serveStatic(annotateFolder, {fallthrough: false}));
    WebApp.connectHandlers.use("/visualization", serveStatic(visualizationFolder, {fallthrough: false}));
    WebApp.connectHandlers.use("/mask", serveStatic(maskFolder, {fallthrough: false}));

    WebApp.connectHandlers.use(bodyParser.raw({limit: "200mb", type: 'application/octet-stream'}));
    WebApp.connectHandlers.use('/save', function (req, res) {
        const fileToSave = pointcloudsFolder + decodeURIComponent(req.url).replace("/save", "");
        const dir = fileToSave.match("(.*\/).*")[1];
        shell.mkdir('-p', dir);

        var wstream = createWriteStream(fileToSave);
        wstream.write(req.body);
        wstream.end();
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
        res.end("Sent: " + fileToSave);
    });
});