const streamifier = require('streamifier')
const Discord = require('discord.js')
const client = new Discord.Client()
const Lame = require('node-lame').Lame;
const fs = require('fs');

const API_KEY = require('./apiKey.js')

// to add the bot to a server, visit this link:
// https://discordapp.com/api/oauth2/authorize?client_id=632379244940361738&scope=bot&permissions=51481616

var activeReceivers = []

client.on('ready', () => {
	console.log(`Logged in as ${client.user.tag}`)
	client.user.setActivity('Chilling like a villain')

	// create channels in guilds, if not already present
	client.guilds.forEach(guild => {
		if (!guild.channels.some(chan => chan.name === 'epic-gamer-moments'))
			createEpicChannel(guild);
	})
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
	if (msg.content.toUpperCase() === '!EGB REPLAY') {
		if (msg.member.voiceChannel) {
			let recData = activeReceivers.find(rec => rec.guildId === msg.guild.id);
			if (recData) {
				playBuffer(recData.guildId, recData.receiver.voiceConnection);
			}
			else 
				msg.reply('It looks like I\'m not in your voice channel right now')
		}
		else
			msg.reply('It looks like you\'re not in a voice channel right now')
	}
	if (msg.content.toUpperCase() === '!EGB SAVE') {
		if (msg.member.voiceChannel) {
			let recData = activeReceivers.find(rec => rec.guildId === msg.guild.id);
			if (recData) {
				postMP3(msg.guild);
				msg.reply('Now THAT was an epic gamer moment');
			}
			else
				msg.reply('It looks like I\'m not in your voice channel right now')
		}
		else
			msg.reply('It looks like you\'re not in a voice channel right now')
	}
})

client.on('speak', evt => {
	console.log(evt)
})

client.login(API_KEY);

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
			usersInChannel: [], // actually only has users in channel who have spoken at least once,
			startTime: new Date(),
		})
		console.log('At time of receiver creation, guild id = ' + channel.guild.id);
		cxn.playFile('EpicGamerIntro.m4a')
		cxn.on('speaking', (user, speaking) => onUserSpeaking(user, speaking, channel.guild.id))
		receiver.on('pcm', (user, buf) => onPCM(user.id, buf, channel.guild.id))
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
function onUserSpeaking(user, speaking, guildId) {
	console.log(user + ' is speaking: ' + speaking);
	let recData = activeReceivers.find(rec => guildId === rec.guildId);
	recData.usersInChannel.push({
		userId: user.id,
		lastSpeakTime: recData.startTime,
		buffer: null,
		bufferOffset: 0
	})
}

/**
 * Makes silence buffer up to current time in buffer for user
 * @param {*} user the user whose buffer we are padding with silence
 * @param {*} recData receiver data for the channel
 * @param {boolean} force whether or not to forcibly add silence, regardless of delta time
 */
function fillSilence(userId, recData, force) {
	// get time since last speaking
	let userData = recData.usersInChannel.find(test => test.userId === userId);
	let now = new Date();
	let padbuf = null;

	// if user hasn't been added yet
	if (!userData) {
		userData = {
			userId,
			lastSpeakTime: recData.startTime,
			buffer: null,
			bufferOffset: 0
		};
		recData.usersInChannel.push(userData);
	}

	// fill pad buffer with silence PRN
	if (userData.lastSpeakTime) {
		let deltaTime = now - userData.lastSpeakTime;
		if (force || deltaTime > 500) {
			console.log('Delta Time: ' + deltaTime);
			let bytesToFill = 32 * deltaTime * 48 / 8;
			// writing more than 2 MAX_BUFs does nothing
			bytesToFill = Math.min(Math.floor(bytesToFill / MAX_BUF), 1)*MAX_BUF + bytesToFill % MAX_BUF;
			console.log('Bytes to fill: ' + bytesToFill);
			padbuf = Buffer.alloc(bytesToFill);
			console.log('padbuf.length: ' + padbuf.length);
		}
	}
	userData.lastSpeakTime = now;

	debugger;
	return padbuf;
}

const MAX_BUF = 15 * 48000 * 32 / 8; // 15 s * samples/s * bits/sample * bytes/bit
function onPCM(userId, newbuf, guildId, force = false) {
	// get receiver data
	let recData = activeReceivers.find(rec => guildId === rec.guildId);
	let userData = recData.usersInChannel.find(user => userId === user.userId);

	// build silence buffer
	const padbuf = fillSilence(userId, recData, force);

	// append data to buffer
	let oldbuf = userData.buffer;
	// combine all of the new stuff
	const sumbuf = padbuf ? Buffer.concat([padbuf, newbuf], padbuf.length + newbuf.length) : newbuf;

	// the first time you write the buffer
	if (!oldbuf) {
		if (sumbuf.length < MAX_BUF) {
			userData.buffer = sumbuf;
			userData.bufferOffset += newbuf.length;
			return;
		}
		else {
			userData.buffer = Buffer.allocUnsafe(MAX_BUF);
		}
	}

	// calculate new length of buffer, if everyhting is just concatenated
	const newLength = sumbuf.length + (oldbuf ? oldbuf.length : 0);

	// if there's still room, then write all of it
	if (newLength < MAX_BUF) {
		userData.buffer = Buffer.concat([oldbuf, sumbuf], newLength);
		userData.bufferOffset += sumbuf.length;
	}
	// otherwise, fill remaining, then overwrite existing buffer
	else {
		const oldOffset = userData.bufferOffset;
		const oldLength = userData.buffer.length;
		var bytesWritten = 0;

		// concatenate to fill up to MAX_BUF
		if (oldLength < MAX_BUF) {
			if (oldLength != oldOffset) {
				console.log('If this is printed to the console, run for your life');
				console.log('oldLength: ' + oldLength);
				console.log('oldOffset: ' + oldOffset);
			}
			userData.buffer = Buffer.concat([oldbuf, sumbuf], MAX_BUF);
			bytesWritten = MAX_BUF - oldOffset;
			userData.bufferOffset = 0;
		}
		// if just copying will overflow
		else if (userData.bufferOffset + sumbuf.length > MAX_BUF) {
			// overwrite at the offset position until MAX_BUF reached
			try {
			sumbuf.copy(userData.buffer, userData.bufferOffset, 0, MAX_BUF - userData.bufferOffset);
			} catch (e) {
				console.log('bufferOffset: ' + userData.bufferOffset);
				console.log('MAX_BUF: ' + MAX_BUF);
				console.log('sumbuf.length: ' + sumbuf.length)
			}
			bytesWritten = MAX_BUF - oldOffset
			userData.bufferOffset = 0;
		}
		// paste in whatever is left
		try {
			while (bytesWritten < sumbuf.length) {
				sumbuf.copy(userData.buffer, userData.bufferOffset, bytesWritten);
				// the number of bytes written is either the number of bytes left to write, or the 
				// maximum number of bytes I could have possibly written, whichever is less
				const delta = Math.min(MAX_BUF - userData.bufferOffset, sumbuf.length - bytesWritten);
				bytesWritten += delta;
				// the % resets to zero if we filled the buffer
				userData.bufferOffset = (userData.bufferOffset + delta) % MAX_BUF;
			}
		} catch (e) {	
			console.log('bufferOffset: ' + userData.bufferOffset);
			console.log('MAX_BUF: ' + MAX_BUF);
			console.log('sumbuf.length: ' + sumbuf.length)
		}
	}
}

function playBuffer(guildId, cxn) {
	console.log('Playing buffer')
	let recData = activeReceivers.find(rec => guildId === rec.guildId);
	let masterBuffer = null;
	const now = new Date();
	recData.usersInChannel.forEach(userData => {
		if (!userData.buffer) {
			console.log('There is no buffer to play')
			return;
		}

		// fill with silence up to current time
		for (let user of recData.usersInChannel) {
			onPCM(user.userId, Buffer.allocUnsafe(0), guildId, force = true);
		}

		// the no loop buffer is rearranged to be in sequential order
		let noLoopBuffer = Buffer.allocUnsafe(userData.buffer.length);
		userData.buffer.copy(noLoopBuffer, 0, userData.bufferOffset, userData.buffer.length);
		userData.buffer.copy(noLoopBuffer, userData.buffer.length - userData.bufferOffset, 0, userData.bufferOffset);
	
		// copy first buffer
		if (masterBuffer === null) {
			masterBuffer = Buffer.allocUnsafe(noLoopBuffer.length);
			noLoopBuffer.copy(masterBuffer, 0);
		}
		// alternatively, add buffers together
		else {
			console.log('We have multiple users, boiz')
			for (let i = 0; i < noLoopBuffer.length; i++) {
				masterBuffer[i] = masterBuffer[i] + noLoopBuffer[i];
			}
		}

		// reset user's buffer
		userData.buffer = null;
		userData.bufferOffset = 0;
		userData.lastSpeakTime = now;
	});

	let stream = streamifier.createReadStream(masterBuffer);
	cxn.playConvertedStream(stream).on('end', () => {
		cxn.setSpeaking(false); // doesn't actually update on Discord
		console.log('done speaking'); // this does work
	});

	// create mp3 from buffer
	const encoder = new Lame({
		output: guildId + '.mp3',
		bitrate: recData.receiver.voiceConnection.channel.bitrate
	}).setBuffer(masterBuffer);
	encoder.encode().then(() => console.log('File written')).catch(console.error);
}

async function postMP3(guild) {
	let chan = guild.channels.find(chan => chan.name === 'epic-gamer-moments');
	if (!chan) {
		await createEpicChannel(guild);
		chan = guild.channels.find(chan => chan.name === 'epic-gamer-moments');
	}
	const path = guild.id + '.mp3';
	chan.send({files: [{attachment: path, name: 'epicGamerMoment.mp3'}]}).then(
		() => fs.unlink(path).catch(console.error)
	).catch(console.error);
}

/**
 * Creates the channel that messages are posted to
 */
async function createEpicChannel(guild) {
	return guild.createChannel('epic-gamer-moments', { 
		type: 'text',
		permissionOverwrites: [{
			deny: Discord.Permissions.FLAGS.SEND_MESSAGES,
			id: guild.defaultRole
		}, {
			allow: Discord.Permissions.FLAGS.SEND_MESSAGES,
			id: client.user.id
		}]
	}).then(channel => channel.send(`Epic Gamer Bot has entered the chat!
To summon the bot into a voice channel, type \`!egb link start\`.
To replay the last 15 seconds of voice chat, type \`!egb replay\`. 
To save a replay in the #epic-gamer-moments channel, type \`!egb save\`.
To stop recording voice chat, type \`!egb stop\`.
Commands can be typed into any text channel, as long as you are in the desired voice channel.
EpicGamerBot can only listen to one channel at a time per server.`
	));
}
