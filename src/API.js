import {
  API_URL
} from './settings'


import _ from 'lodash'
import fetch from 'node-fetch'
import Protobuf from 'protobufjs'
import path from 'path'

var builder = Protobuf.newBuilder();


var rootPath= path.join(__dirname,'../')
var bufferFile = Protobuf.loadProtoFile({ root: rootPath, file: "POGOProtos/POGOProtos.proto" })
const POGOProtos = bufferFile.build("POGOProtos")

class Connection {
  constructor(parent) {
    this.parent = parent
    this.endPoint = API_URL
    this.auth_ticket = null
    this.numConsecutiveEndpointFailures = 0;
  }

  async Request(requests, userObj){
    let res = await this._request(requests, userObj)
    //we have response (returns = response we want.. now lets parse it)
    var respt = {}
    requests.map( (req,key) => {
      //setFileName
      var ResponseType = this._resolveProtoFilename(req.request)
      ResponseType = ResponseType + 'Response'
      var Responses = POGOProtos.Networking.Responses
      try {
        respt[ResponseType] = Responses[ResponseType].decode(res.returns[key])
        this.parent.log.info('[i] Received OK: '+ResponseType)
      } catch(error) {
        this.parent.log.info('[!] Response error!')
        throw error
      }
    if (ResponseType == 'GetMapObjectsResponse'){
      console.log(respt.GetMapObjectsResponse.map_cells)
    }
    }) 

    return respt
  }

  async _request(reqs, userObj) {

    if (this.endPoint.length < 5 || !this.endPoint)
      throw new Error('[!] No endPoint set!')

    if (userObj.latitude == 0 || userObj.longitude == 0)
      throw new Error('[!] position missing')

    var req = this._serializeRequest(reqs)
    var request = this._serializeHeader(req, userObj)

    // //create buffer
    var protobuf = request.encode().toBuffer();

    var options = {
      url: this.endPoint,
      body: protobuf,
      encoding: null,
      headers: {
        'User-Agent': 'Niantic App'
      }
    }

    let res = await fetch(this.endPoint, {
      body: protobuf,
      method: 'POST',
      headers: {
        'User-Agent': 'Niantic App'
      }
    })

    let body = await res.buffer()


    try {
      res = POGOProtos.Networking.Envelopes.ResponseEnvelope.decode(body);
    } catch (e) {
      if (e.decoded) { // Truncated
        this.parent.log.warn(e);
        res = e.decoded; // Decoded message with missing required fields
      }
    }

    if (res.status_code == 2){
      this.parent.log.error('[!] Response error, lets try again.. in 2 seconds')
      await new Promise(resolve => setTimeout(resolve, 2000))
      this.Request(reqs, userObj)
    }

    if (res.auth_ticket)
      this.auth_ticket = res.auth_ticket

    if (res.returns)
      return res
    else
      throw new Error("Nothing in reponse..")
  }

  async setEndpoint(user){
    let res = await this._request([
        {request: 'GET_PLAYER' },
        {request: 'GET_HATCHED_EGGS' },
        {request: 'GET_INVENTORY' },
        {request: 'CHECK_AWARDED_BADGES' },
        {request: 'DOWNLOAD_SETTINGS' },
    ], user)

    if (res.api_url) {
      this.endPoint = `https://${res.api_url}/rpc`
      this.parent.log.error('[!] Endpoint set: '+ this.endPoint);
      this.numConsecutiveEndpointFailures = 0;
      return this.endPoint
    } else {
      this.numConsecutiveEndpointFailures++;
      if (this.numConsecutiveEndpointFailures >= 5) {
        throw 'Too many consecutive "Missing endpoint" failures. Abandoning login.';
      }
      this.parent.log.error('[!] Endpoint missing in request, lets try again.. in 5 seconds');
      return new Promise( resolve =>
        setTimeout(() =>
          resolve(this.setEndpoint(user))
        , 5000)
      )
    }
  }

  _resolveProtoFilename(call){
    return call.split('_').reduce( (prev, word) => {
      return prev + _.upperFirst(_.toLower(word))
    }, '')
  }

  _setEndpoint(body) {
    if (res.api_url) {
      this.parent.log.info('[i] Received API Endpoint: ' + this.endPoint)
      resolve(this.endPoint)
    }
  }

  _serializeRequest(reqs) {
    return reqs.map( req => {
      var Requests = POGOProtos.Networking.Requests

      var reqId = Requests.RequestType[req.request]
      var request = new Requests.Request({'request_type': reqId})

      //set message?
      if (req.message != undefined){
        var MessageType = this._resolveProtoFilename(req.request)
        MessageType += 'Message'
        request.request_message = new Requests.Messages[MessageType](req.message).encode()
      }
      return request
    })
  }

  _serializeHeader(req, userObj) {
    var data = {
      status_code: 2,
      request_id: 1469378659230941192,
      latitude: userObj.latitude,
      longitude: userObj.longitude,
      altitude: userObj.altitude,
      unknown12: 989,
      requests: req,
    }

    if(this.auth_ticket != null) {
      data.auth_ticket = this.auth_ticket
    } else {
      data.auth_info = new POGOProtos.Networking.Envelopes.RequestEnvelope.AuthInfo({
        provider: userObj.provider,
        token: new POGOProtos.Networking.Envelopes.RequestEnvelope.AuthInfo.JWT({
          contents: userObj.accessToken,
          unknown2: 59,
        })
      })
    }

    if (this.auth_ticket != null)
      data.auth_ticket = this.auth_ticket

    return new POGOProtos.Networking.Envelopes.RequestEnvelope(data);
  }

  set authTicket(body) {
    if (res.auth_ticket)
      this.auth_ticket = res.auth_ticket
  }

}

Connection.POGOProtos = POGOProtos

export default Connection
