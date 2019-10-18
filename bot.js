const streamifier = require('streamifier')
const Discord = require('discord.js')
const client = new Discord.Client()

// to add the bot to a server, visit this link:
// https://discordapp.com/api/oauth2/authorize?client_id=632379244940361738&scope=bot&permissions=51481616

var activeReceivers = []

client.on('ready', () => {
	console.log(`Logged in as ${client.user.tag}`)
	client.user.setActivity('Chilling like a villain')
})

client.on('message', msg => {
	if (msg.content === 'ping') {
		msg.reply('pong')
	}
	if(msg.content.toUpperCase() === '!EGB LINK START') {
		// attempt to join voice channel of sender
		if (!msg.guild) return; // ignore if the message wasn't in a server
		if (msg.member.voiceChannel) {
			if (activeReceivers.find(rec => rec.guildId === msg.guild.id)) 				
				msg.reply('I\'m already in a voice channel for this guild')
			else
				startRecording(msg)
		}
		else {
			msg.reply('It looks like you\'re not in a voice channel right now')
		}
	}
	if (msg.content.toUpperCase() === '!EGB STOP') {
		if (msg.member.voiceChannel)
			stopRecording(msg.member.voiceChannel)
		else
			msg.reply('I\'m just chilling bro')
	}
})

client.on('speak', evt => {
	console.log(evt)
})

client.login('***REMOVED***')

// joins channel and updates status
function startRecording(msg) {
	let channel = msg.member.voiceChannel
	channel.join().then(cxn => {
		msg.reply('Initiating epic gaming')
		client.user.setActivity('Gaming Epically')
		const receiver = cxn.createReceiver()
		activeReceivers.push({
			guildId: channel.guild.id,
			receiver: receiver,
			bitrate: channel.bitrate,
			buffer: null,
			timerId: null,
			usersInChannel: [] // actually only has users in channel who have spoken at least once
		})
		console.log('At time of receiver creation, guild id = ' + channel.guild.id);
		cxn.playFile('stranger_c418.wav')
		cxn.on('speaking', (user, speaking) => onUserSpeaking(user, speaking, channel.guild.id, cxn))
		receiver.on('pcm', (user, buf) => onPCM(user, buf, channel.guild.id, cxn))
	}).catch(console.log)
}

// leaves channel and updates status
function stopRecording(voiceChannel) {
	voiceChannel.leave()
	// TODO check if bot is in selected channel
	activeReceivers = activeReceivers.filter(rec => rec.guildId !== voiceChannel.guild.id)
	client.user.setActivity('Chilling like a villain')
}

// create channel
function onUserSpeaking(user, speaking, guildId, cxn) {
	console.log(user + ' is speaking: ' + speaking);
	let recData = activeReceivers.find(rec => guildId === rec.guildId);
	recData.timerId = setTimeout(() => playBuffer(guildId, cxn), 10000);
	recData.usersInChannel.push({
		userId: user.id,
		lastSpeakTime: null
	})
}

function onPCM(user, newbuf, guildId, cxn) {
	// get receiver data
	let recData  = activeReceivers.find(rec => guildId === rec.guildId);

	// get time since last speaking
	let userData = recData.usersInChannel.find(test => test.userId === user.id);
	let now = new Date();
	let padbuf = null;
	if (userData.lastSpeakTime) {
		let deltaTime = now - userData.lastSpeakTime;
		if (deltaTime > 500) {
			console.log('Delta Time: ' + deltaTime);
			let bytesToFill = 32 * deltaTime * 48 / 8;
			console.log('Bytes to fill: ' + bytesToFill);
			padbuf = Buffer.alloc(bytesToFill);
			console.log('padbuf.length: ' + padbuf.length);
		}
	}
	userData.lastSpeakTime = now;

	// append data to buffer
	let oldbuf = recData.buffer;
	if (!oldbuf) {
		recData.buffer = newbuf;
	} 
	else {
		if (padbuf) {
			recData.buffer = Buffer.concat([oldbuf, padbuf, newbuf], oldbuf.length + padbuf.length + newbuf.length);
			console.log('Buffer write appears successful')
		}
		else
			recData.buffer = Buffer.concat([oldbuf, newbuf], oldbuf.length + newbuf.length);
	}
}

function playBuffer(guildId, cxn) {
	console.log('Playing buffer')
	let receiver = activeReceivers.filter(rec => guildId === rec.guildId)[0];
	let stream = streamifier.createReadStream(receiver.buffer);
	cxn.playConvertedStream(stream);
	console.log('Played buffer');
}
