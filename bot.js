const Discord = require('discord.js')
const client = new Discord.Client()

// to add the bot to a server, visit this link:
// https://discordapp.com/api/oauth2/authorize?client_id=632379244940361738&scope=bot&permissions=51481616

client.on('ready', () => {
	console.log(`Logged in as ${client.user.tag}`)
})

client.on('message', msg => {
	if (msg.content === 'ping') {
		msg.reply('pong')
	}
})

client.login('***REMOVED***')
