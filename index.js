/*
MIT License

Copyright (c) 2020 Karl-Erik Gustafsson

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

const fetch = require('node-fetch');
const AisEncode = require("ggencoder").AisEncode

module.exports = function createPlugin(app) {
  const plugin = {};
  plugin.id = 'skais-to-nmea0183';
  plugin.name = 'Other vessels data to AIS NMEA0183';
  plugin.description = 'tdb';

  var position_update = null;
  var position_retention = null;
  var position_radius = null;
  var url;
  var headers;
  var headers = '{ "accept": "application/geo+json" }';
  var interval_id1;
  var interval_id2;
  var unsubscribes = [];

plugin.start = function (options, restartPlugin) {

  app.subscriptionmanager.subscribe(
    localSubscription,
    unsubscribes,
    subscriptionError => {
      app.error('Error:' + subscriptionError);
    },
    delta => {
      delta.updates.forEach(u => {
        app.debug(u);
      });
    }
  );

  interval_id1 = setInterval(read_info,(5000));
  setTimeout(clear, 5000);
  interval_id2 = setInterval(read_info,(position_update * 60000));

  };

//----------------------------------------------------------------------------
// State Mapping

let stateMapping = {
  'motoring': 0,
  'anchored': 1,
  'not under command': 2,
  'restricted manouverability': 3,
  'constrained by draft': 4,
  'moored': 5,
  'aground': 6,
  'fishing': 7,
  'sailing': 8,
  'hazardous material high speed': 9,
  'hazardous material wing in ground': 10,
  'ais-sart': 14,
  'default': 15
}

//----------------------------------------------------------------------------
// Rad to Deg
function radians_to_degrees(radians)
{
  var pi = Math.PI;
  return ((radians * 180)/pi);
}

//----------------------------------------------------------------------------
// m/s to  knots
function ms_to_knots(speed)
{
  return ((speed * 3.6) / 1.852);
}

//----------------------------------------------------------------------------
// Clear start interval

  function clear() {
    clearInterval(interval_id1);
  };

//----------------------------------------------------------------------------
// json size
function lengthInUtf8Bytes(str,str2) {
  var m = encodeURIComponent(str).match(/%[89ABab]/g);
  return (((str.length + (m ? m.length : 0))/1024) + (str2*0.2)).toFixed(1);
}

//----------------------------------------------------------------------------
// nmea out

function ais_out(enc_msg) {
  var enc= new AisEncode(enc_msg)
  var sentence = enc.nmea
  if ( sentence && sentence.length > 0 )
  {
    app.debug(sentence)
    app.emit('nmea0183out', sentence)
  }
}

//----------------------------------------------------------------------------
// Read and parse AIS data

  read_info = function read_data() {
        var url ="http://localhost:3000/signalk/v1/api/vessels";

        fetch(url, { method: 'GET'})
          .then((res) => {
             return res.json()
        })
        .then((json) => {
          var jsonContent = JSON.parse(JSON.stringify(json));
          var numberAIS = Object.keys(jsonContent).length;
          for (i = 1; i < numberAIS; i++) {
            var jsonKey = Object.keys(jsonContent)[i];

            enc_msg_3 = {
              aistype: 3, // class A position report
              repeat: 0,
              mmsi: jsonContent[jsonKey].mmsi,
              navstatus: stateMapping[jsonContent[jsonKey].navigation.state.value],
              sog: ms_to_knots(jsonContent[jsonKey].navigation.speedOverGround.value),
              lon: jsonContent[jsonKey].navigation.position.value.longitude,
              lat: jsonContent[jsonKey].navigation.position.value.latitude,
              cog: radians_to_degrees(jsonContent[jsonKey].navigation.courseOverGroundTrue.value),
              hdg: radians_to_degrees(jsonContent[jsonKey].navigation.headingTrue.value),
              rot: radians_to_degrees(jsonContent[jsonKey].navigation.rateOfTurn.value)
            }

            enc_msg_5 = {
              aistype: 5, //class A static
              repeat: 0,
              mmsi: jsonContent[jsonKey].mmsi,
              imo: (jsonContent[jsonKey].registrations.imo).substring(4, 20),
              cargo: jsonContent[jsonKey].design.aisShipType.value.id,
              callsign: jsonContent[jsonKey].communication.callsignVhf,
              shipname: jsonContent[jsonKey].name,
              draught: jsonContent[jsonKey].design.draft.value.current/10,
              destination: jsonContent[jsonKey].navigation.destination.commonName.value,
              dimA: 0,
              dimB: jsonContent[jsonKey].design.length.value.overall,
              dimC: (jsonContent[jsonKey].design.beam.value)/2,
              dimD: (jsonContent[jsonKey].design.beam.value)/2
            }

            enc_msg_18 = {
              aistype: 18, // class B position report
              repeat: 0,
              mmsi: jsonContent[jsonKey].mmsi,
              sog: ms_to_knots(jsonContent[jsonKey].navigation.speedOverGround.value),
              accuracy: 0,
              lon: jsonContent[jsonKey].navigation.position.value.longitude,
              lat: jsonContent[jsonKey].navigation.position.value.latitude,
              cog: radians_to_degrees(jsonContent[jsonKey].navigation.courseOverGroundTrue.value),
              hdg: radians_to_degrees(jsonContent[jsonKey].navigation.headingTrue.value)
            }

            enc_msg_24_0 = {
              aistype: 24, // class B static
              repeat: 0,
              part: 0,
              mmsi: jsonContent[jsonKey].mmsi,
              shipname: jsonContent[jsonKey].name
            }

            enc_msg_24_1 = {
              aistype: 24, // class B static
              repeat: 0,
              part: 1,
              mmsi: jsonContent[jsonKey].mmsi,
              cargo: jsonContent[jsonKey].design.aisShipType.value.id,
              callsign: jsonContent[jsonKey].communication.callsignVhf,
              dimA: 0,
              dimB: jsonContent[jsonKey].design.length.value.overall,
              dimC: (jsonContent[jsonKey].design.beam.value)/2,
              dimD: (jsonContent[jsonKey].design.beam.value)/2
            }

            if (jsonContent[jsonKey].sensor.ais.class.value == "A") {
               ais_out(enc_msg_3);
               ais_out(enc_msg_5);
            }
            if (jsonContent[jsonKey].sensor.ais.class.value == "B") {
               ais_out(enc_msg_18);
               ais_out(enc_msg_24_0);
               ais_out(enc_msg_24_1);
            }

          }
        })
        .catch(err => console.error(err));
  };

//----------------------------------------------------------------------------

  plugin.stop = function stop() {
    clearInterval(interval_id2);
    unsubscribes.forEach((f) => f());
    unsubscribes = [];
    app.debug('Stopped');
  };

  plugin.schema = {
    type: 'object',
    properties: {
      position_update: {
        type: 'integer',
        default: 1,
        title: 'How often AIS data is sent to NMEA0183 out (in minutes)',
      }
    },
  };

  return plugin;
};
