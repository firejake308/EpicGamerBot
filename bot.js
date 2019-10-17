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
		if (msg.member.voiceChannel)
			startRecording(msg)
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
			timerId: null		
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
	//clearInterval(activeReceivers.filter(rec => rec.guildId === voiceChannel.guildId)[0].timerId)
	activeReceivers = activeReceivers.filter(rec => rec.guildId !== voiceChannel.guild.id)
	client.user.setActivity('Chilling like a villain')
}

// create channel
function onUserSpeaking(user, speaking, guildId, cxn) {
	console.log(user + ' is speaking: ' + speaking);
	let rec = activeReceivers.filter(rec => guildId === rec.guildId)[0];
	rec.timerId = setTimeout(() => playBuffer(guildId, cxn), 5000);
	console.log('Set timeout');
	setTimeout(() => console.log('timer works', 1000));
}

function onPCM(user, newbuf, guildId, cxn) {
	var rec  = activeReceivers.filter(rec => guildId === rec.guildId)[0];
	var oldbuf = rec.buffer;
	if (!oldbuf) {
		rec.buffer = newbuf;
	} 
	else {
		rec.buffer = Buffer.concat([oldbuf, newbuf], oldbuf.length + newbuf.length);
	}
}

function playBuffer(guildId, cxn) {
	console.log('Playing buffer')
	let receiver = activeReceivers.filter(rec => guildId === rec.guildId)[0];
	let stream = streamifier.createReadStream(receiver.buffer);
	cxn.playConvertedStream(stream);
	console.log('Played buffer');
}
