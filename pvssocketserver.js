//#!/usr/bin/env node
/**
Copyright (c) 2012

Patrick Oladimeji
This file is part of pvsio-web.

pvsio-web is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

pvsio-web is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with Foobar.  If not, see <http://www.gnu.org/licenses/>.
*/
/**
 * This file creates a connection to a pvsio process run locally or at specified host.
 * It also creates an express webserver to serve demo applications e.g. the infusion
 * pump pvsio demo.
 * The websocket connection started by this process listens for 3 commands:
 * sendCommand: used to send a pvsio command to the processs
 * startProcess: used to start the pvsio process
 * getSourceCode: used to get the source code of the pvs code being executed
 * @author patrick
 * @date 28 Jul 2012 21:52:31
 *
 */
/*jshint unused: true, undef: true*/
/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50, undef: true, node: true */
/*global __dirname*/

function run() {
    "use strict";

    var pvsio                   = require("./pvsprocess"),
        path                    = require("path"),
        ws                      = require("ws"),
        util                    = require("util"),
        http                    = require("http"),
        fs                      = require("fs"),
        express                 = require("express"),
        bodyParser              = require("body-parser"),
        webserver               = express(),
        procWrapper             = require("./processwrapper"),
        uploadDir               = "/public/uploads",
        port                    = 8082,
        pvsioProcessMap         = {},//each client should get his own process
        httpServer              = http.createServer(webserver),
        Promise                 = require("es6-promise").Promise,
        logger                  = require("tracer").console(),
        baseProjectDir          = __dirname + "/public/projects/";
    var p, clientid = 0, WebSocketServer = ws.Server;

    function getFolderStructure(root) {
        var s = fs.statSync(root);
        var file = {path: root, name: root.substr(root.lastIndexOf("/") + 1)};
        if (s.isDirectory()) {
            var files = fs.readdirSync(root);
            file.isDirectory = true;
            file.children = files.map(function (f) {
                return getFolderStructure(path.join(root, f));
            });
            if (file.children) {
                file.children = file.children.filter(function (f) {
                    return (f.isDirectory && f.name !== "pvsbin") || f.name.split(".").slice(-1).join("") === "pvs";
                });
            }
            
            file.path = file.path.replace(baseProjectDir, "");
            return file;
        
        } else {
            file.path = file.path.replace(baseProjectDir, "");
            return file;
        }
    }
    
    /**
     * Utility function that dispatches responses to websocket clients
     * @param {{type:string, data}} token The token to send to the client
     * @param {Socket} socket The websocket to use to send the token
     */
    function processCallback(tok, socket) {
        //called when any data is recieved from pvs process
        //if the type of the token is 'processExited' then send message to client if the socket is still open
        if (tok.type === 'processExited') {
            if (socket.readyState === 1) {
                socket.send(JSON.stringify(tok));
            }
        } else {//send the message normally
            socket.send(JSON.stringify(tok));
        }
    }

    /**
     * save the file described in request parameter into the uploads directory
     * @param {object} token
     */
    function saveTempFile(token, cb) {
        var fileContent = token.fileContent;
        var fileName = token.newFileName;
        var oldFileName = token.oldFileName, oldFilePath = __dirname + uploadDir + "/" + oldFileName;
        var destName = __dirname + uploadDir + "/" + fileName;
        if (fileContent && fileName) {
            fs.writeFileSync(destName, fileContent);
        } else if (oldFileName && fileName) {
            fs.renameSync(oldFilePath, destName);
        }
        cb({fileName: fileName});
    }
    /**
     * reads and changes the settings in the .pvsioweb file in the project root
    */
    function changeProjectSetting(projectName, key, value, callback) {
        var file = baseProjectDir + projectName + "/.pvsioweb", props = {};
        //write the property file in the project root
        function writeFile(props, cb) {
            fs.writeFile(file, JSON.stringify(props, null, " "), function (err) {
                if (err) {
                    props.err = err;
                }
                if (cb) {
                    cb(props);
                }
            });
        }
        //if file does not exist, create it. Else read the property file and update just the key value specified
        fs.exists(file, function (exists) {
            if (!exists) {
                props[key] = value;
                writeFile(props, callback);
            } else {
                fs.readFile(file, {encoding: "utf8"}, function (err, res) {
                    props = {err: err};
                    if (!err) {
                        props =  JSON.parse(res) || props;
                        props[key] = value;
                        //write the file back
                        writeFile(props, callback);
                    } else {
                        if (callback) {
                            callback(props);
                        }
                    }
                });
            }
        });
    }

    
    /**
     * creates a directory structure
     */
    function mkdirRecursive(dirPath, cb) {
        fs.mkdir(dirPath, function (error) {
            if (error && error.errno === 34) {
                // the callback will be invoked only by the first instance of mkdirRecursive
                var parentDirectory = dirPath.substr(0, dirPath.lastIndexOf("/"));
                mkdirRecursive(parentDirectory, function f() {
                    fs.mkdir(dirPath, cb);
                });
            } else {
                // if the path has been created successfully, just invoke the callback function (if any)
                if (cb && typeof cb === "function") { cb(); }
            }
        });
    }
    
    /**
     * writes files (directory structure is automatically created
     */
    
    ///FIXME: It is not clear how this functions handles errors
    function writeFiles(files, cb) {
        function writeFilesAux(files, i, cb) {
            if (i < files.length && i >= 0) {
                var f, dir;
                f = files[i];
                dir = f.path.substr(0, f.path.lastIndexOf(path.sep));
                logger.debug("generating directory structure " + dir);
                mkdirRecursive(dir, function (err) {
                    fs.writeFile(f.path, f.fileContent, {encoding: f.encoding || "utf8"}, function (err) {
                        if (!err) {
                            logger.debug("file " + f.path + " saved successfully!");
                            i++;
                            if (i < files.length) {
                                writeFilesAux(files, i, cb);
                            } else {
                                logger.debug("all files have been processed... sending data back to client.");
                                if (cb && typeof cb === "function") { cb(err, files); }
                            }
                        } else { logger.debug("error while saving file " + f.path + " (" + err + ")"); }
                    });
                });
            }
        }
        writeFilesAux(files, 0, cb);
    }
    
    /**
     * Creates a project
     * @param {Request} req
     * @param {Response} res
     */
    function createProject(opt, cb, p) {
        var projectName = opt.projectName,
            imageName = opt.imageFileName,
            imageData = opt.imageData,
            projectPath = baseProjectDir + projectName,
            specFiles = opt.specFiles,
            mainPVSFile = opt.mainPVSFile,
            overWrite = opt.overWrite,
            widgetDefinitions = opt.widgetDefinitions;
        var obj = {type: "projectCreated"};
            
        function doCreate(cb) {
            // utility functions
            function complete_doCreate(err, files) {
                // always return paths relative to baseProjectDir
                files.forEach(function (f) {
                    f.path = f.path.replace(projectPath, projectName);
                });
                obj.pvsFiles = files;
                
                //by default set the main pvs file to be the first item in the list after sort
                mainPVSFile = mainPVSFile || files.sort()[0].path;
                if (mainPVSFile) {
                    obj.mainPVSFile = mainPVSFile;
                    // create a main file in the project settings
                    changeProjectSetting(projectName, "mainPVSFile", obj.mainPVSFile);
                }
                
                // get project folder structure once all files have been wrtten
                obj.folderStructure = getFolderStructure(projectPath);
                // and make sure that the folder structure contains paths relative to baseProject
                obj.folderStructure.path = obj.folderStructure.name;
                obj.folderStructure.children.forEach(function (child) {
                    child.path = child.path.replace(projectPath, projectName);
                });
                obj.projectPath = obj.folderStructure.path;
                if (widgetDefinitions) {
                    fs.writeFile(path.join(projectPath, "widgetDefinition.json"), widgetDefinitions, function (err) {
                        obj.err = err;
                        if (cb && typeof cb === "function") { cb(obj); }
                    });
                }
               
            }

            fs.mkdirSync(projectPath);
            obj.projectPath = projectPath;
            obj.name = projectName;

            if (imageName && imageData) {
                var imageString = imageData.replace(/^data:image\/(\w+);base64,/, ""),
                    imagePath = path.join(projectPath, imageName);
                fs.writeFileSync(imagePath, imageString, "base64");
                obj.imagePath = imagePath;
                obj.imageData = imageData;
            }

            if (specFiles && specFiles.length > 0) {
                var files = specFiles.map(function (f) {
                    if (f.fileName.indexOf(projectName) === 0) {
                        return {path: path.join(baseProjectDir, f.fileName), fileContent: f.fileContent};
                    }
                    logger.debug("Warning, deprecated filenames (project name not included in the filename)");
                    return {path: path.join(projectPath, f.fileName), fileContent: f.fileContent};
                });
                writeFiles(files, complete_doCreate);
            }
        }
        
        fs.mkdir(projectPath, function (err) {
            if (!err || (err.code === "EEXIST" && overWrite)) {
                p.removeFile(projectPath, function (err) {
                    if (!err) {
                        doCreate(cb);
                    } else {
                        obj.err = err;
                        if (cb && typeof cb === "function") { cb(obj); }
                    }
                });
            } else {
                obj.err = err;
                if (cb && typeof cb === "function") { cb(obj); }
            }
        });
    }

    /**
    * open a project with the specified projectName
    */
    function openProject(projectName) {
        logger.debug("Opening project " + projectName + " ...");
        var imageExts = ["jpg", "jpeg", "png"],
            specExts = ["pvs"],
            projectPath = baseProjectDir + projectName,
            stat = fs.statSync(projectPath),
            res = { name: projectName };
        
        function openProjectAux(folder) {
            var stat = fs.statSync(folder);
            if (stat.isDirectory()) {
                fs.readdirSync(folder).forEach(function (file) {
                    var filePath = path.join(folder, file);
                    stat = fs.statSync(filePath);
                    if (stat.isFile()) {
                        var ext = file.indexOf(".") > -1 ? file.split(".")[1].toLowerCase() : "";
                        if (imageExts.indexOf(ext) > -1) {
                            res.imagePath = filePath.replace(baseProjectDir, "");
                            res.imageData = "data:image/" + ext + ";base64," + fs.readFileSync(filePath, "base64");
                        } else if (specExts.indexOf(ext) > -1) {
                            res.pvsFiles = res.pvsFiles || [];
                            res.pvsFiles.push({path: filePath.replace(baseProjectDir, ""),
                                               fileContent: fs.readFileSync(filePath, 'utf8')});
                        } else if (file === "widgetDefinition.json") {
                            res.widgetDefinition = JSON.parse(fs.readFileSync(filePath, "utf8"));
                        } else if (file === ".pvsioweb") {
                            var config = JSON.parse(fs.readFileSync(filePath, "utf8"));
                            res.mainPVSFile = config.mainPVSFile;
                        } else if (file === "scripts.json") {
                            res.scripts = JSON.parse(fs.readFileSync(filePath, "utf8"));
                        } else {
                            res.other = res.other || [];
                            res.other.push(filePath.replace(baseProjectDir, ""));
                        }
                    } else if (stat.isDirectory) {
                        openProjectAux(filePath);
                    }
                });
            }
        }

        if (stat.isDirectory()) {
            openProjectAux(projectPath);
            //load the first file if there is no .pvsioweb file in the root of the project
            if (!res.mainPVSFile && res.pvsFiles && res.pvsFiles.length) {
                res.pvsFiles.sort(function (a, b) { return a.path < b.path ? -1 : a.path === b.path ? 0 : 1; });
                res.mainPVSFile = res.pvsFiles[res.pvsFiles.length - 1];
            }
            res.folderStructure = getFolderStructure(projectPath);
            res.folderStructure.path = res.folderStructure.name;
            res.folderStructure.children.forEach(function (child) {
                child.path = child.path.replace(projectPath, projectName);
            });
            res.projectPath = res.folderStructure.path;
            return res;
        } else {
            logger.error("error while opening project " + projectPath);
            return null;
        }
    }

    /**
     * Lists all the projects on the server by listing folder names in the projects directory
     * @return {Array<string>} A list of project names
     */
    function listProjects() {
        var res;
        try {
            res = fs.readdirSync(baseProjectDir).map(function (d) {
                var stat = fs.statSync(baseProjectDir + d);
                if (stat.isDirectory()) {
                    return d;
                } else {
                    return null;
                }
            }).filter(function (d) {return d !== null; });
        } catch (err) {
            res = { err: err };
        }
        return res;
    }

    //create logger
    webserver.use("/demos", function (req, res, next) {
        logger.log('Method: %s,  Url: %s, IP: %s', req.method, req.url, req.connection.remoteAddress);
        next();
    });
    //create the express static server and use public dir as the default serving directory
    webserver.use(express.static(__dirname + "/public"));
    webserver.use(bodyParser({ keepExtensions: true, uploadDir: __dirname + uploadDir}));

    /**
     * used to manage file upload process for pvsio-web
     */
    webserver.all("/upload", function (req, res) {
        logger.debug(JSON.stringify(req.files));
        var fileName = req.files.file.path.split("/").slice(-1).join("");
        //should return a map of oldname to new name for the uploaded files
        res.send({fileName: fileName});
    });

    function typeCheck(filePath, cb) {
        procWrapper().exec({
            command: "proveit " + filePath,
            callBack: cb
        });
    }
    
    /**
        get function maps for client sockets
    */
    function createClientFunctionMaps() {
        var map = {
            "renameFile": function (token, socket, socketid) {
                var oldPath = path.join(baseProjectDir, token.oldPath);
                var newPath = path.join(baseProjectDir, token.newPath);
                fs.rename(oldPath, newPath, function (err) {
                    if (err) {
                        logger.debug("warning, error while renaming " + token.oldPath +
                                    " into " + token.newPath + " (" + err + ")");
                    }
                    processCallback({id: token.id, socketId: socketid, err: err}, socket);
                });
            },
            "readDirectory": function (token, socket, socketid) {
                fs.readdir(token.path, function (err, files) {
                    if (!err) {
                        //get stat attributes for all the files using an async call
                        var promises = files.map(function (f) {
                            return new Promise(function (resolve, reject) {
                                fs.stat(f, function (err, res) {
                                    if (err) {
                                        reject(err);
                                    } else {
                                        resolve(res);
                                    }
                                });
                            });
                        });
                        
                        Promise.all(promises)
                            .then(function (res) {
                                var result = res.map(function (d, i) {
                                        return {name: files[i], isDirectory: d.isDirectory()};
                                    });
                                processCallback({id: token.id, socketId: socketid, files: result, err: err}, socket);
                            }, function (err) {
                                processCallback({id: token.id, socketId: socketid, err: err}, socket);
                            });
                    } else {
                        processCallback({id: token.id, socketId: socketid, err: err}, socket);
                    }
                });
            },
            "writeDirectory": function (token, socket, socketid) {
                fs.mkdir(token.path, function (err) {
                    processCallback({id: token.id, socketId: socketid, err: err}, socket);
                });
            },
            "setMainFile": function (token, socket, socketid) {
                changeProjectSetting(token.projectName, "mainPVSFile", token.fileName, function (res) {
                    res.id = token.id;
                    res.socketId = socketid;
                    res.serverSent = new Date().getTime();
                    processCallback(res, socket);
                });
            },
            "saveTempFile": function (token, socket, socketid) {
                saveTempFile(token, function (res) {
                    res.id = token.id;
                    res.socketId = socketid;
                    res.serverSent = new Date().getTime();
                    processCallback(res, socket);
                });
            },
            "listProjects": function (token, socket, socketid) {
                var projects = listProjects();
                var res = projects.err ? projects : {id: token.id, serverSent: new Date().getTime(), projects: projects, socketId: socketid};
                processCallback(res, socket);
            },
            "openProject": function (token, socket, socketid) {
                var project = openProject(token.name);
                var res = {project: project, id: token.id, serverSent: new Date().getTime(), socketId: socketid};
                processCallback(res, socket);
            },
            "createProject": function (token, socket, socketid) {
                p = pvsioProcessMap[socketid] || pvsio();
                pvsioProcessMap[socketid] = p;
                createProject(token, function (res) {
                    res.id = token.id;
                    res.socketId = socketid;
                    res.serverSent = new Date().getTime();
                    processCallback(res, socket);
                }, p);
                
            },
            "typeCheck": function (token, socket, socketid) {
                typeCheck(token.filePath, function (err, stdout, stderr) {
                    var res = {id: token.id, err: err, stdout: stdout, stderr: stderr, socketId: socketid};
                    processCallback(res, socket);
                });
            },
            "sendCommand": function (token, socket, socketid) {
                p = pvsioProcessMap[socketid];
                p.sendCommand(token.data.command, function (data) {
                    var res = {id: token.id, data: [data], socketId: socketid, type: "commandResult"};
                    processCallback(res, socket);
                });
            },
            "startProcess": function (token, socket, socketid) {
                logger.info("Calling start process for client... " + socketid);
				var root = token.data.projectName ?
                            "/public/projects/" + token.data.projectName
                            : token.data.demoName ? "/public/demos/" + token.data.demoName : "";
                p = pvsioProcessMap[socketid];
                //close the process if it exists and recreate it
                if (p) {
                    p.close();
                    delete pvsioProcessMap[socketid];
                }
                //recreate the pvsio process
                p = pvsio();
                pvsioProcessMap[socketid] = p;
                //set the workspace dir and start the pvs process with a callback for processing any responses from
                //the process
                p.workspaceDir(__dirname + root)
                    .start(token.data.fileName, function (token) {
                        token.socketId = socketid;
                        processCallback(token, socket);
                    },
                        function (res) {
                            res.id = token.id;
                            res.serverSent = new Date().getTime();
                            res.socketId = socketid;
                            processCallback(res, socket);
                        });
            },
            "closeProcess": function (token, socket, socketid) {//closes pvs process
                p = pvsioProcessMap[socketid];
                var res = {id: token.id, socketId: socketid};
                if (p) {
                    p.close();
                    delete pvsioProcessMap[socketid];
                    res.message = "process closed";
                } else {
                    res.type = "attempting to close undefined process";
                }
                processCallback(res, socket);
                
            },
            "readFile": function (token, socket, socketid) {
                p = pvsioProcessMap[socketid];
                var encoding = token.encoding || "utf8";
                fs.readFile(token.fileName, encoding, function (err, content) {
                    var res = err ? {err: err} : {id: token.id, serverSent: new Date().getTime(), fileContent: content, socketId: socketid};
                    processCallback(res, socket);
                });
            },
            "writeFile": function (token, socket, socketid) {
                p = pvsioProcessMap[socketid];
                var encoding = token.encoding || "utf8";
                var projectPath = baseProjectDir + token.projectName;
                
                function complete_writeFile(err, files) {
                    var res = {id: token.id, serverSent: new Date().getTime(), socketId: socketid, err: err};
                    processCallback(res, socket);
                }
                
                var filePath = token.fileName;
                if (filePath.indexOf(projectPath) === 0) {
                    logger.debug("Warning, deprecated filenames (project path should not be included in the filename)");
                    filePath = path.join(projectPath, filePath);
                } else { filePath = path.join(baseProjectDir, filePath); }
                
                var files = [{path: filePath, fileContent: token.fileContent, encoding: encoding}];
                writeFiles(files, complete_writeFile);
            },
            "writeImage": function (token, socket, socketid) {
                p = pvsioProcessMap[socketid];
                var encoding = token.encoding || "base64";
                // directory "projects" is the base path for creating files
                token.fileName = path.resolve(baseProjectDir, token.fileName);
                token.fileContent = token.fileContent.replace(/^data:image\/(\w+);base64,/, "");
                fs.writeFile(token.fileName, token.fileContent, encoding, function (err) {
                    var res = {id: token.id, serverSent: new Date().getTime(), socketId: socketid};
                    if (!err) {
                        logger.debug("file " + token.fileName +
                                 " saved successfully (socket id = " + socketid + ")");
                        res.type = "fileSaved";
                    } else {
                        res.err = err;
                    }
                    processCallback(res, socket);
                });
            },
            "deleteFile": function (token, socket, socketid) {
                p = pvsioProcessMap[socketid];
                p.removeFile(token.fileName, function (err, res) {
                    res = {id: token.id, serverSent: new Date().getTime(), socketId: socketid};
                    if (!err) {
                        res.type = "fileDeleted";
                    } else {
                        res.err = err;
                    }
                    processCallback(res, socket);
                });
            }
        };

        return map;
    }

    var wsServer = new WebSocketServer({server: httpServer});
    wsServer.on("connection", function (socket) {
        var socketid =  clientid++;
        var functionMaps = createClientFunctionMaps();
        socket.on("message", function (m) {
            var token = JSON.parse(m);
            var f = functionMaps[token.type];
            if (f && typeof f === 'function') {
                //call the function with token and socket as parameter
                f(token, socket, socketid);
            } else {
                logger.warn("f is something unexpected -- I expected a function but got type " + typeof f);
            }
        });

        socket.on("close", function () {
            logger.info("closing websocket client " + socketid);
            var _p = pvsioProcessMap[socketid];
            if (_p) {
                _p.close();
            }
            delete pvsioProcessMap[socketid];
        });
    });

    wsServer.on("error", function (err) {
        logger.error(JSON.stringify(err));
    });

    httpServer.listen(port);
    logger.info("http server started .." + "now listening on port " + port);
}

run();
