var Promise = require('bluebird');
var sha256 = require('js-sha256');
var bigInt = require("big-integer");
var fs = Promise.promisifyAll(require('fs'));
var request = require('request');
var cheerio = require('cheerio');
var mkdirp = Promise.promisifyAll(require('mkdirp'));
var request = require('request');

var database;

var token;
var endpoint;
var username;
var password;
var skypeToken;


function isJSON(str) {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

//Following function courtesy of ShyykoSerhiy: https://github.com/ShyykoSerhiy/skyweb/blob/eea87e770fd36720a8141d6e02abb52c4039a693/dist/utils.js#L37
function makeHash(challenge, appId, key) {
	function padRight(original, totalWidth, ch) {
        function stringFromChar(ch, count) {
            var s = ch;
            for (var i = 1; i < count; i++) {
                s += ch;
            }
            return s;
        }
        if (original.length < totalWidth) {
            ch = ch || ' ';
            return original + stringFromChar(ch, totalWidth - original.length);
        }
        return original.valueOf();
    }
    function parseHexInt(s) {
        var result = parseInt(s, 16);
        if (isNaN(result)) {
            return 0;
        }
        return result;
    }
    function int32ToHexString(n) {
        var hexChars = '0123456789abcdef';
        var hexString = '';
        for (var i = 0; i <= 3; i++) {
            hexString += hexChars.charAt((n >> (i * 8 + 4)) & 15);
            hexString += hexChars.charAt((n >> (i * 8)) & 15);
        }
        return hexString;
    }

    function int64Xor(a, b) {
        var sA = a.toString(2);
        var sB = b.toString(2);
        var sC = '';
        var sD = '';
        var diff = Math.abs(sA.length - sB.length);
        var i;
        for (i = 0; i < diff; i++) {
            sD += '0';
        }
        if (sA.length < sB.length) {
            sD += sA;
            sA = sD;
        }
        else if (sB.length < sA.length) {
            sD += sB;
            sB = sD;
        }
        for (i = 0; i < sA.length; i++) {
            sC += (sA.charAt(i) === sB.charAt(i)) ? '0' : '1';
        }
        return parseInt(sC.toString(), 2);
    }
    function cS64_C(pdwData, pInHash, pOutHash) {
        var MODULUS = 2147483647;
        if ((pdwData.length < 2) || ((pdwData.length & 1) === 1)) {
            return false;
        }
        var ulCS64_a = pInHash[0] & MODULUS;
        var ulCS64_b = pInHash[1] & MODULUS;
        var ulCS64_c = pInHash[2] & MODULUS;
        var ulCS64_d = pInHash[3] & MODULUS;
        var ulCS64_e = 242854337;
        var CS64_a = bigInt(ulCS64_a.toString());
        var CS64_b = bigInt(ulCS64_b.toString());
        var CS64_c = bigInt(ulCS64_c.toString());
        var CS64_d = bigInt(ulCS64_d.toString());
        var CS64_e = bigInt(ulCS64_e.toString());
        var pos = 0;
        var mod = bigInt(MODULUS.toString());
        var qwDatum = bigInt('0');
        var qwMAC = bigInt('0');
        var qwSum = bigInt('0');
        for (var i = 0; i < pdwData.length / 2; i++) {
            qwDatum = bigInt(pdwData[pos++].toString());
            qwDatum.multiply(CS64_e);
            qwDatum.mod(mod);
            qwMAC.add(qwDatum);
            qwMAC.multiply(CS64_a);
            qwMAC.add(CS64_b);
            qwMAC.mod(mod);
            qwSum.add(qwMAC);
            qwMAC.add(bigInt(pdwData[pos++].toString()));
            qwMAC.multiply(CS64_c);
            qwMAC.add(CS64_d);
            qwMAC.mod(mod);
            qwSum.add(qwMAC);
        }
        qwMAC.add(CS64_b);
        qwMAC.mod(mod);
        qwSum.add(CS64_d);
        qwSum.mod(mod);
        pOutHash[0] = parseInt(qwMAC.toString(), 10);
        pOutHash[1] = parseInt(qwSum.toString(), 10);
        return true;
    }
    var clearText = challenge + appId;
    var remaining = 8 - (clearText.length % 8);
    if (remaining !== 8) {
        clearText = padRight(clearText, clearText.length + remaining, '0');
    }
    var cchClearText = clearText.length / 4;
    var pClearText = [];
    var i;
    var pos;
    for (i = 0, pos = 0; i < cchClearText; i++) {
        pClearText.splice(i, 0, 0);
        pClearText[i] = pClearText[i] + clearText.charCodeAt(pos++) * 1;
        pClearText[i] = pClearText[i] + clearText.charCodeAt(pos++) * 256;
        pClearText[i] = pClearText[i] + clearText.charCodeAt(pos++) * 65536;
        pClearText[i] = pClearText[i] + clearText.charCodeAt(pos++) * 16777216;
    }
    var sha256Hash = new Array(4);
    var hash = sha256.sha256(challenge + key).toUpperCase();
    for (i = 0, pos = 0; i < sha256Hash.length; i++) {
        sha256Hash[i] = 0;
        sha256Hash[i] += parseHexInt(hash.substr(pos, 2)) * 1;
        pos += 2;
        sha256Hash[i] += parseHexInt(hash.substr(pos, 2)) * 256;
        pos += 2;
        sha256Hash[i] += parseHexInt(hash.substr(pos, 2)) * 65536;
        pos += 2;
        sha256Hash[i] += parseHexInt(hash.substr(pos, 2)) * 16777216;
        pos += 2;
    }
    var macHash = new Array(2);
    cS64_C(pClearText, sha256Hash, macHash);
    var a = int64Xor(sha256Hash[0], macHash[0]);
    var b = int64Xor(sha256Hash[1], macHash[1]);
    var c = int64Xor(sha256Hash[2], macHash[0]);
    var d = int64Xor(sha256Hash[3], macHash[1]);
    return int32ToHexString(a) + int32ToHexString(b) + int32ToHexString(c) + int32ToHexString(d);
};

var tokenTryIndex = 0;

function getToken(manualST, time, cb){
	var subOptions = {
		url: 'https://client-s.gateway.messenger.live.com/v1/users/ME/endpoints',
		headers: {
			'Authentication': 'skypetoken='+manualST,
			'LockAndKey': 'appId=msmsgs@msnmsgr.com; time='+time+'; lockAndKeyResponse='+makeHash(((new Date().getTime()) / 1000), 'msmsgs@msnmsgr.com', 'Q1P7W2E4J9R8U3S5')
		},
		body: '{}'
	}
	request.post(subOptions, function(err,response,body){
		console.log("[Skype] Logged in successfully");
		endpoint = response.headers['location'];
		token = response.headers['set-registrationtoken'];
		if(!token){
			console.error("[Skype] Must refresh Skype token. Please hold.");
			tokenTryIndex++;
			if(tokenTryIndex < 5){
				manualSkypeLogin(function(r){
					getToken(skypeToken, Math.floor(new Date() / 1000), cb)
				})
			}
		}else{
			cb();
		}
	})
}

function manualSkypeLogin(cb){
	console.log("[SKYPE] Manually logging in");
	request.get('https://login.skype.com/login', function(error,response,body){
		var cher = cheerio.load(response.body);
		var time = Math.floor(new Date() / 1000);
		var options = {
			url: 'https://login.skype.com/login?client_id=578134&redirect_uri=https://web.skype.com',
			form: {
				username: username,
				password: password,
				pie: cher('#pie')[0].attribs.value,
				etm: cher('#etm')[0].attribs.value,
				timezone_field: '-04|00',
				js_time: time
			}
		}
		request.post(options, function(err,response,body){
			var tiptop = cheerio.load(response.body);
			skypeToken = tiptop('input[name=skypetoken]')[0].attribs.value;

			fs.readFileAsync(global.appRoot+'/cache.json', 'utf-8')
			.then(function(r){
				getToken(skypeToken, time, function(){
					cb();
				})
				var code = JSON.parse(r.toString())
				code.modules.skype = {skypeToken: skypeToken};
				fs.writeFileAsync(global.appRoot+'/cache.json', JSON.stringify(code))
			})

		})
	})
};

function login2Skype(localUsername, localPassword){
	username = localUsername;
	password = localPassword;
	return new Promise(function(res,rej){
		fs.readFileAsync(global.appRoot+'/cache.json', 'utf-8')
		.then(function(r){
			var code = JSON.parse(r.toString())
			var skInstance = code.modules.skype;

			if(!skInstance.skypeToken){
				manualSkypeLogin(function(){
					res();
				})
			}else{
				skypeToken = skInstance.skypeToken
				getToken(skInstance.skypeToken, Math.floor(new Date() / 1000), function(){
					res();
				})
			}
		})
		.catch(function(e){
			console.error(e);
		})
	})
};

function createEndpoint(){
	var requestBody = JSON.stringify({
            "id": "messagingService",
            "type": "EndpointPresenceDoc",
            "selfLink": "uri",
            "privateInfo": { "epname": "GehlyMessenger" },
            "publicInfo": {
                "capabilities": "video|audio",
                "type": 1,
                "skypeNameVersion": "skype.com",
                "nodeInfo": "xx",
                "version": '908/1.30.0.128//skype.com'
            }
        });
	var options= {
		url: endpoint+'/presenceDocs/messagingService',
		body: requestBody,
		headers: {
		  'RegistrationToken': token,
		}
	};
	request.put(options, function(error,response,body){
		console.log("[Skype] Endpoint created");
	})
}

function processBody(body){
	var drop = ['EndpointPresence', 'UserPresence', 'ConversationUpdate', 'Control/Typing'];
	if(drop.indexOf(body.resourceType) !== -1 || !body.resource.content){
		return;
	}
	console.log("[Skype]", "Polled: ", body)
	var name;
	var chatId = body.resource.from.split(':')[2];
	var fromUser = body.resource.from.split(':')[2];
	database.addMessage(body.resource.content, body.resource.id, chatId, fromUser, body.originalarrivaltime, 'skype')
}

function poll(){
	var options= {
		url: endpoint+'/subscriptions/0/poll',
		body: '{}',
		headers: {
		  'RegistrationToken': token,
		}
	}
	request.post(options, function(error,response,body){
		var parse;
		if(isJSON(body)){
			parse = JSON.parse(body)
		}else{
			return console.log("[Skype]", body);
		}
		if(body.errorCode){
			console.log("[Skype]", body.error);
			return;
		}
		if(!parse.eventMessages || parse.eventMessages.length == 0){
			return;
		}
		for(i=0;i<parse.eventMessages.length;i++){
			if(parse.eventMessages[i]){
				processBody(parse.eventMessages[i])
			}
		}
	})
}

function subscribe(){
	var options = {
		url: endpoint+'/subscriptions',
		headers: {
		  'RegistrationToken': token,
		},
		body: '{interestedResources: ["/v1/threads/ALL", "/v1/users/ME/contacts/ALL", "/v1/users/ME/conversations/ALL/messages", "/v1/users/ME/conversations/ALL/properties"], template: "raw", channelType: "httpLongPoll"}'
	}
	request.post(options, function(error, response, body){
		console.log("[Skype] Subscribed to endpoints.");
	})
}

function keepAlive(){
	var options = {
		url: endpoint+'/active',
		headers: {
		  'RegistrationToken': token,
		},
		body: '{timeout: 12}'
	}
	request.post(options, function(error, response, body){
		console.log("[Skype] Endpoint Refreshed.");
	})
}


function createNameForConversation(conversation){
	return new Promise(function(res,rej){
		if(conversation.threadProperties){
			if(conversation.threadProperties.topic){
				name = conversation.threadProperties.topic
			}else{
				return res();
			}
			res(name);
		}else{
			var uid = conversation.id.split(':')[1];
			database.models.contact.findOne({where: {instance: uid}})
			.then(function(r){
				if(!r){
					r = {};
					r.name = uid;
				}
				res(r.name)
				
			})
		}
	})
}

function processConversation(conversation){
	return new Promise(function(res,rej){		
		createNameForConversation(conversation)
		.then(function(r){
			res({id: conversation.id, topic: r, link: conversation.messages, originalarrivaltime: conversation.lastMessage.originalarrivaltime});
		})
	})
}

function processMessage(message){
	return new Promise(function(res,rej){
		var authorId = message.from.split(":")[2];
		var object = {content: message.content, id: message.id, author: null, originalarrivaltime: message.originalarrivaltime};
		database.models.contact.findOne({where: {instance: message.from.split(":")[2]}})
		.then(function(r){
			if(r){
				object.author = r.dataValues;
			}else{
				object.author = {name: authorId, instance: '404', type: 'skype'}
			}
			res(object);
		})
	})
}
function downloadProfilePicture(url, fileName){
	var directory = global.appRoot+'/assets/skype/'+username+'/';
	mkdirp(directory, function(err){
		if(url){
			request.get(url).pipe(fs.createWriteStream(directory+fileName+'.jpg'))
		}		
	});
}
function addOwnProfile(){
	return new Promise(function(res,rej){
		var options = {
			url: 'https://api.skype.com/users/self/profile',
			headers: {
				'X-Skypetoken': skypeToken,
			},
		}
		request.get(options, function(error, response, body){
			var json = JSON.parse(body);
			downloadProfilePicture(json.avatarUrl, json.username);
			var name = json.firstname;
			if(json.lastname){
				name += " "+json.lastname
			}
			database.addContact(name, json.username, 'skype')
			.then(function(r){
				res();
			})
		});
	})
}
module.exports = {
	username: null,
	type: 'skype',
	initialize: function(db, data){
		this.username = data.username;
		database = require(global.appRoot+"database.js")(db);
		return new Promise(function(res,rej){
			login2Skype(data.username, data.password)
			.then(function(r){
				createEndpoint();
				subscribe()
				keepAlive()
				setInterval(function(){
					keepAlive()
				}, 45000);
				poll();
				setInterval(function(){
					poll()
				}, 500);
				res();
			})
		})
		.catch(function(e){
			throw e;
		});
	},
	getConversations: function(){
		return new Promise(function(res,rej){
			var options = {
			  url: 'https://bn2-client-s.gateway.messenger.live.com/v1/users/ME/conversations/?view=msnp24Equivalent&targetType=Passport%7CSkype%7CLync%7CThread&startTime=0',
			  headers: {
			    'RegistrationToken': token,
			  },
			};
			request.get(options, function(error,response,body){
				if(!isJSON(body)){
					return res();
				}
				var parse = JSON.parse(body);
				Promise.map(parse.conversations, function(convo){
					return processConversation(convo)
				})
				.then(function(r){
					for(i=0;i<r.length;i++){
						r[i].module = 'skype';
					}
					res(r);
				})
			});
		})
	},
	getMessages: function(id){
		return new Promise(function(res,rej){
			var options = {
			  url: 'https://client-s.gateway.messenger.live.com/v1/users/ME/conversations/'+id+'/messages?startTime=0&view=msnp24Equivalent',
			  headers: {
			    'RegistrationToken': token,
			  },
			};

			request.get(options, function(error,response,body){
				var parse;
				if(!isJSON(body)){
					return cb();
				}
				parse = JSON.parse(body);
				Promise.map(parse.messages, function(msg){
					return processMessage(msg)
				})
				.then(function(r){
					res(r);
				})
			});
		})
	},
	getContacts: function(){
		return new Promise(function(res,rej){
			var options = {
				url: 'https://contacts.skype.com/contacts/v1/users/'+username+'/contacts',
				headers: {
					'X-Skypetoken': skypeToken,
				},
			}
			request.get(options, function(error, response, body){
				var json = JSON.parse(body).contacts;
				Promise.map(json, function(item){
					downloadProfilePicture(item.avatar_url, item.id);
					return database.addContact(item['display_name'], item.id, 'skype')
				})
				.then(function(r){
					return addOwnProfile();
				})
				.then(function(){
					console.log("[Skype] Contacts completed.")
					res();
				})
				.catch(function(e){
					console.error(e);
				})
			})
		})
	},

}