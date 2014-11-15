'use strict';

(function(){
    angular
        .module('Fled',['ngRoute','ngMaterial'])
        .config(config);

    function config($compileProvider, $routeProvider) {

        $compileProvider.aHrefSanitizationWhitelist(/^\s*(https?|ftp|mailto|chrome-extension):/);

        $routeProvider
            .when('/', {
                templateUrl: '../tmpl/serialList.html',
                controller: 'SerialCtrl',
                controllerAs: 's',
                resolve: {
                    serialDevices: function(SerialAPI) {
                        return SerialAPI.getDevices();
                    }
                }
            })
            .when('/connected/:id', {
                templateUrl: '../tmpl/connected.html',
                controller: 'ConnectedCtrl',
                controllerAs: 'c',
                resolve: {
                    connectedDevice: function($route,SerialAPI) {

                        return SerialAPI.getInfo($route.current.params.id * 1);
                    }
                }
            });
    }

})();

(function(){
    angular
        .module('Fled')
        .controller('SerialCtrl', SerialCtrl);

    function SerialCtrl($q,$location,serialDevices, SerialAPI) {

        var self = this,
            connectionId;

        this.devices = serialDevices;
        this.connected = {};

        this.connect = function(path) {


            $q.when(SerialAPI.connect(path)).then(function(data) {
                connectionId = data.connectionId;
                self.connected  = data;
                self.connected.path = path;
                $location.url('/connected/'+connectionId);


            });

        };

        //@TODO: check device list every 2 sec


    }
})();

(function(){
    angular
        .module('Fled')
        .controller('ConnectedCtrl', ConnectedCtrl);

    function ConnectedCtrl($timeout, connectedDevice, SerialAPI, FledCmds) {
        var self = this;

        this.device = connectedDevice;


        //must be defined command protocol

        // this.sendData = function(data) {

        //     var hex = data.split(" "),
        //         ab = new ArrayBuffer(hex.length),
        //         binaryArray = new Uint8Array(ab);

        //     for(var i = 0; i < hex.length; i++) {
        //         ab[i] = parseInt(hex[i],16);
        //     }
        //     SerialAPI.write(connectedDevice.connectionId, ab).then(function(){
        //         self.serialData = "";
        //     });

        // };

        this.writeToEEPROM = function(data) {

            var cmds = FledCmds.writeToEEPROM(0,data);

            recursiveCmds(cmds);

            function recursiveCmds(cmds) {
                if(cmds.length > 0) {
                    $timeout(function(){
                        var currentCmd = cmds.shift();
                        SerialAPI.write(connectedDevice.connectionId, currentCmd.buffer).then(function() {
                            console.log("Write successfull");
                            recursiveCmds(cmds);
                        });
                    }, 350); // maybe can be less
                }

            };


        };

        this.loadedImage = function(data, image) {
            //push image to service or to fled-simulator directive that can require a uploadImage directive
            console.log(data,image);
            // console.log(image.width, image.height, image);
        };


        //@TODO: check device list every 2 sec


    }
})();

(function(){
    angular
        .module('Fled')
        .directive('uploadImage', uploadImage);

    function uploadImage() {
        return {
            restrict: 'E',
            templateUrl: '../tmpl/uploadImage.html',
            replace: true,
            scope: {
                'imageSrc': '='
            },
            link: function(scope,elem,attr) {

                scope.dragdropText = 'Drag image here!';

                elem.on('dragover', function(e) {
                    e.stopPropagation();
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'copy';
                    elem.removeClass('active').addClass('hover');
                    scope.dragdropText = 'Drop It!';
                    scope.$apply();
                });
                elem.on('dragleave', function(e) {
                    e.stopPropagation();
                    e.preventDefault();
                    elem.removeClass('active hover');
                    scope.dragdropText = 'Drag image here!';
                    scope.$apply();
                });
                elem.on('drop', function(e) {
                    e.stopPropagation();
                    e.preventDefault();

                    var file = e.dataTransfer.files[0];

                    if(!file.type.match('image.*')) {
                      return;
                    }
                    scope.imageSrc = URL.createObjectURL(file);

                    elem.removeClass('hover').addClass('active');
                    scope.dragdropText = file.name;
                    scope.$apply();
                });

                scope.$on('$destroy', function() {
                    elem.off('dragover dragleave drop');
                });

            }
        };
    }



})();


(function(){
    angular
        .module('Fled')
        .directive('fledSimulator', fledSimulator);

    function fledSimulator() {
        return {
            restrict: 'E',
            templateUrl: '../tmpl/fledSimulator.html',
            replace: true,
            scope: {
                'source': '=',
                'serialData': '=',
                'steps': '@',
                'totLeds': '@'
            },
            link: function(scope,elem,attrs) {



                var image = new Image();

                var u8 = new Uint8Array(scope.steps*scope.totLeds / 8); // bytes not bits
                var serialData = new BitView(u8.buffer);

                var canvas = elem.find('canvas')[0],
                    layer0Canvas = document.createElement("canvas"),
                    layer1Canvas = document.createElement("canvas"),
                    layer2Canvas = document.createElement("canvas");

                layer0Canvas.width = layer1Canvas.width = layer2Canvas.width = canvas.width = canvas.offsetWidth;
                layer0Canvas.height = layer1Canvas.height = layer2Canvas.height = canvas.height = canvas.offsetHeight;

                var ctx = canvas.getContext('2d'),
                    layer0 = layer0Canvas.getContext('2d'),
                    layer1 = layer1Canvas.getContext('2d'),
                    layer2 = layer2Canvas.getContext('2d');

                layer2.fillStyle = "#00FF00";

                scope.$watch('source', function(src) {
                    image.src = src;
                });

                // image.onload = ctrl.onLoad;
                image.onload = render;


                function render() {




                    var boundaries = getImageBoundaries(this),
                        imageData;

                    clear();
                    layer0.drawImage(this, boundaries.top, boundaries.left, boundaries.width, boundaries.height);

                    resampleImage(0);

                    layer1.fill();
                    layer2.fill();

                    ctx.drawImage(layer1Canvas,0,0);
                    ctx.drawImage(layer2Canvas,0,0);

                    console.log(serialData);
                    scope.$apply(function(scope) {
                        scope.serialData = serialData.u8;
                    });

                }

                // reposition and resize image according to the canvas dimensions
                function getImageBoundaries(image) {
                    var ratio = 1,
                        width = 0,
                        height = 0,
                        top = 0,
                        left = 0;

                    ratio = image.width / image.height;

                    if(ratio < 1) {
                        height = canvas.height;
                        width = height * ratio;
                        top = (canvas.width - width) / 2;
                    } else {
                        width = canvas.width;
                        height = width / ratio;
                        left = (canvas.height - height) / 2;
                    }

                    return {
                        width: width,
                        height: height,
                        top: top,
                        left: left
                    };
                }

                function resampleImage(alpha) {

                    var r = (canvas.width > canvas.height) ?  canvas.height/2 : canvas.width/2;

                    layer1.beginPath();
                    layer2.beginPath();

                    for(var i=0, length = scope.totLeds * scope.steps; i < length; i++) {

                        if(i !== 0 && i % scope.totLeds == 0) {
                          alpha = (alpha+1) % scope.steps ; // % scope.steps maybe is not required
                        }

                        var alphaRad = alpha * 2 * Math.PI / scope.steps,
                            distance = r/scope.totLeds * (scope.totLeds - ( i % scope.totLeds ));


                        var x = distance * Math.cos(alphaRad + Math.PI/2 ) + canvas.width/2;
                        var y = distance * Math.sin(alphaRad + Math.PI/2 ) + canvas.height/2;
                        var rgba = layer0.getImageData(x  ,y , 1, 1).data;

                        var brightness = 0.34 * rgba[0] + 0.5 * rgba[1] + 0.16 * rgba[2];

                        if(brightness < 127) {
                          // layer0.arc(x,y, 1, 0, Math.PI, true);
                          layer1.rect(x,y,3,3);
                          serialData.setBit(i, 1);
                        } else {
                          layer2.rect(x,y,3,3);
                          serialData.setBit(i, 0);
                        }
                    }


                }

                function clear() {
                    ctx.clearRect(0,0,canvas.width, canvas.height);
                    layer0.clearRect(0,0,canvas.width, canvas.height);
                    layer1.clearRect(0,0,canvas.width, canvas.height);
                    layer2.clearRect(0,0,canvas.width, canvas.height);
                }



            }

        };
    }
})();



(function() {
    angular
        .module('Fled')
        .factory('SerialAPI', function($q){

            if(!chrome.serial) {
                return;
            }

            var options = {
                name: 'fled',
                receiveTimeout: 5000,
                sendTimeout: 5000,
                bitrate: 9600
            };

            return {
                getDevices: function() {
                    var dfd = $q.defer();

                    chrome.serial.getDevices(function(){
                        if(arguments) {
                            dfd.resolve(arguments[0]);
                        } else {
                            dfd.reject();
                        }
                    });



                    return dfd.promise;
                },
                connect: function(device_path) {
                    var dfd = $q.defer();

                    chrome.serial.connect(device_path, options, function(){
                        if(arguments) {
                            dfd.resolve(arguments[0]);
                        } else {
                            dfd.reject();
                        }
                    });

                    return dfd.promise;
                },
                disconnect: function(id) {
                    var dfd = $q.defer();

                    if(!id) {
                        dfd.reject();
                        return dfd.promise;
                    }

                    chrome.serial.disconnect(id, function(result) {
                        if(result) {
                            dfd.resolve();
                        } else {
                            dfd.reject();
                        }

                    });

                    return dfd.promise;



                },
                getInfo: function(connection_id) {


                    var dfd = $q.defer();

                    chrome.serial.getInfo(connection_id, function(){
                        if(arguments) {
                            dfd.resolve(arguments[0]);
                        } else {
                            dfd.reject();
                        }
                    });

                    return dfd.promise;
                },
                write: function(connection_id, data) {
                    var dfd = $q.defer();
                    //data must be an ArrayBuffer
                    chrome.serial.send(connection_id, data, function(){
                        if(arguments) {
                            dfd.resolve(arguments[0]);
                        } else {
                            dfd.reject();
                        }
                    });

                    return dfd.promise;
                }


            };



        });
})();

(function(){
    angular
        .module('Fled')
        .factory('FledCmds', function() {
            var headerByte = [0xFF, 0x55],
                addressLength = 2,
                pageSize= 32, // 32bytes per page
                cmdList = [];



            var buf = new Uint8Array(16);
            var writeToEEPROM = function(address, data) {

                var length;
                if(data.length % 16 == 0) {
                    length = data.length
                } else {
                    length = 16 * (data.length / 16 + 1);
                }

                for(var i = 0; i <= length; i++) {

                    if((i != 0) && (i % 16 == 0)) {
                        var cmd = new Uint8Array(21);
                        //format cmd
                        cmd[0] = headerByte[0];
                        cmd[1] = headerByte[1];
                        cmd[2] = 18;
                        cmd[3] = address << 8;
                        cmd[4] = address & 0xFF;
                        for(var j = 0, len = buf.length; j <len; j++) {
                            cmd[j+5] = buf[j];
                        }

                        cmdList.push(cmd);
                        address += 16;
                    }
                    buf[i%16] = data[i];
                }



                return cmdList;
            };

            return {
                // 'setSteps': setSteps,
                // 'setTotLeds': setTotLeds,
                'writeToEEPROM': writeToEEPROM
            };
        });
})();
