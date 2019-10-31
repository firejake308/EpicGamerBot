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
			usersInChannel: [], // actually only has users in channel who have spoken at least once
			bufferOffset: 0
		})
		console.log('At time of receiver creation, guild id = ' + channel.guild.id);
		cxn.playFile('stranger_c418.wav')
		cxn.on('speaking', (user, speaking) => onUserSpeaking(user, speaking, channel.guild.id, cxn))
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
function onUserSpeaking(user, speaking, guildId, cxn) {
	console.log(user + ' is speaking: ' + speaking);
	let recData = activeReceivers.find(rec => guildId === rec.guildId);
	recData.usersInChannel.push({
		userId: user.id,
		lastSpeakTime: null
	})
}

/**
 * Makes silence buffer up to current time in buffer for user
 * @param {*} user the user whose buffer we are padding with silence
 * @param {*} recData receiver data for the channel
 * @param {*} force whether or  to forcibly add silence, regardless of delta time
 */
function fillSilence(userId, recData, force) {
	// get time since last speaking
	let userData = recData.usersInChannel.find(test => test.userId === userId);
	let now = new Date();
	let padbuf = null;

	if (force)
	debugger;

	// if user hasn't been added yet
	if (!userData) {
		userData = {
			userId,
			lastSpeakTime: now
		};
		recData.usersInChannel.push(userData);
	}

	// fill pad buffer with silence PRN
	if (userData.lastSpeakTime) {
		let deltaTime = now - userData.lastSpeakTime;
		if (force || deltaTime > 500) {
			console.log('Delta Time: ' + deltaTime);
			let bytesToFill = 32 * deltaTime * 48 / 8;
			console.log('Bytes to fill: ' + bytesToFill);
			padbuf = Buffer.alloc(bytesToFill);
			console.log('padbuf.length: ' + padbuf.length);
		}
	}
	userData.lastSpeakTime = now;

	return padbuf;
}

const MAX_BUF = 10 * 48000 * 32 / 8; // 10 s * samples/s * bits/sample * bytes/bit
function onPCM(userId, newbuf, guildId, force = false) {
	// get receiver data
	let recData  = activeReceivers.find(rec => guildId === rec.guildId);

	// build silence buffer
	const padbuf = fillSilence(userId, recData, force);

	// append data to buffer
	let oldbuf = recData.buffer;
	// writing the first buffer is easy
	if (!oldbuf) {
		recData.buffer = newbuf;
		recData.bufferOffset += newbuf.length;
	} 
	else {
		// combine all of the new stuff
		const sumbuf = padbuf ? Buffer.concat([padbuf, newbuf], padbuf.length + newbuf.length) : newbuf;

		// calculate new length of buffer, if everyhting is just concatenated
		const newLength = oldbuf.length + sumbuf.length

		// if there's still room, then write all of it
		if (newLength < MAX_BUF) {
			recData.buffer = Buffer.concat([oldbuf, sumbuf], newLength);
			recData.bufferOffset += sumbuf.length;
		}
		// otherwise, fill remaining, then overwrite existing buffer
		else {
			const oldOffset = recData.bufferOffset;
			const oldLength = recData.buffer.length;
			var bytesWritten = 0;
			// concatenate to fill up to MAX_BUF
			if (oldLength < MAX_BUF) {
				if (oldLength != oldOffset) {
					console.log('oldLength: ' + oldLength);
					console.log('oldOffset: ' + oldOffset);
				}
				recData.buffer = Buffer.concat([oldbuf, sumbuf], MAX_BUF);
				bytesWritten = MAX_BUF - oldOffset
				recData.bufferOffset = 0;
			}
			// if just copying will overflow
			else if (recData.bufferOffset + sumbuf.length > MAX_BUF) {
				// overwrite at the offset position until MAX_BUF reached
				try {
				sumbuf.copy(recData.buffer, recData.bufferOffset, 0, MAX_BUF - recData.bufferOffset);
				} catch (e) {
					console.log('bufferOffset: ' + recData.bufferOffset);
					console.log('MAX_BUF: ' + MAX_BUF);
					console.log('sumbuf.length: ' + sumbuf.length)
				}
				bytesWritten = MAX_BUF - oldOffset
				recData.bufferOffset = 0;
			}
			// paste in whatever is left
			// TODO allow for more than 10 seconds of silence. Will require while loop
			try {
				sumbuf.copy(recData.buffer, recData.bufferOffset, bytesWritten);
			} catch (e) {	
				console.log('bufferOffset: ' + recData.bufferOffset);
				console.log('MAX_BUF: ' + MAX_BUF);
				console.log('sumbuf.length: ' + sumbuf.length)
			}

			recData.bufferOffset += sumbuf.length - bytesWritten;
		}
		//}
	}
}

function playBuffer(guildId, cxn) {
	console.log('Playing buffer')
	let recData = activeReceivers.find(rec => guildId === rec.guildId);

	if (!recData.buffer) {
		console.log('There is no buffer to play')
		return;
	}

	// fill with silence up to current time
	for (let user of recData.usersInChannel) {
		onPCM(user.userId, Buffer.allocUnsafe(0), guildId, force = true);
	}

	// the no loop buffer is rearranged to be in sequential order
	let noLoopBuffer = Buffer.allocUnsafe(recData.buffer.length);
	recData.buffer.copy(noLoopBuffer, 0, recData.bufferOffset, recData.buffer.length);
	recData.buffer.copy(noLoopBuffer, recData.buffer.length - recData.bufferOffset, 0, recData.bufferOffset);
	
	let stream = streamifier.createReadStream(noLoopBuffer);
	cxn.playConvertedStream(stream).on('end', () => {
		cxn.setSpeaking(false); // doesn't actually update on Discord
		console.log('done speaking'); // this does work
	});
	console.log('Played buffer');
}
