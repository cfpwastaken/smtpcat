import net from "net"
import { writeFileSync, mkdirSync } from "fs"
import getConfig from "../config.js"
import Mail from "../models/Mail.js"
import User from "../models/User.js"
import { smtpserver } from "../main.js"
import crypto from "node:crypto";
import Logger from "../Logger.js"

const logger = new Logger("SMTP", "GREEN")

export default class SMTPServer {

	server: net.Server

	constructor(port: number) {
		this.server = net.createServer()
		this.server.listen(port, () => {
			logger.log(`Server listening on port ${port}`)
		});
		this.server.on("connection", this.connection)
	}

	connection(sock: net.Socket) {
		logger.log("Client connected")
		sock.write(`220  ${getConfig("smtp_header")}\r\n`)
		let receivingData = false
		let info = {
			from: "",
			to: [] as string[],
			content: ""
		}
		sock.on("data", async (data: Buffer) => {
			const msg = data.toString()
			// TODO implement regular HELO greeting
			if(receivingData) {
				logger.log(`Received message content: ${msg}`)
				info.content += msg
				if(msg.endsWith(".\r\n")) {
					receivingData = false;
					info.content = info.content.substring(0, info.content.length - 3).replaceAll("\r\n", "\n")
					await smtpserver.handleNewMail(info)
					sock.write("250 OK\r\n")
					logger.log("No longer receiving data -----------------------------------")
					return
				}
				return
			}
			logger.log(`Received data: ${msg}`)
			if(msg.startsWith("EHLO")) {
				sock.write("250-localhost\r\n")
				// We dont have any smtp extensions yet
				sock.write("250 HELP\r\n")
			} else if(msg.startsWith("MAIL FROM:")) {
				// The spec says we should reset the state if the client sends MAIL FROM again
				info = {
					from: "",
					to: [],
					content: ""
				}
				const email = msg.split(":")[1].split(">")[0].replace("<", "")
				logger.log(`MAIL FROM: ${email}`)
				info.from = email
				sock.write(`250 OK\r\n`)
			} else if(msg.startsWith("RCPT TO:")) {
				if(info.from == "") {
					// The spec says we should return 503 if the client has not sent MAIL FROM yet
					sock.write(`503 Bad sequence of commands\r\n`)
					return
				}
				const email = msg.split(":")[1].split(">")[0].replace("<", "")
				const username = email.split("@")[0]
				const domain = email.split("@")[1]
				if(domain != getConfig("host")) {
					// The spec says we MAY forward the message ourselves, but simply returning 550 is fine, and the client should handle it
					sock.write(`550 Requested action not taken: mailbox unavailable\r\n`)
					return
				}
				const user = await User.findOne({ where: { username } })
				if(!user) {
					sock.write(`550 Requested action not taken: mailbox unavailable\r\n`)
					return
				}
				info.to.push(email)
				logger.log(`RCPT TO: ${email}`)
				sock.write("250 OK\r\n")
			} else if(msg.startsWith("DATA")) {
				// The spec says we should return either 503 or 554 if the client has not sent MAIL FROM or RCPT TO yet
				// We will send 554 because it is more specific
				if(info.from == "" || info.to.length == 0) {
					sock.write(`554 No valid recipients\r\n`)
					return
				}
				receivingData = true;
				logger.log("Now receiving data -----------------------------------")
				sock.write("354 Start mail input; end with <CRLF>.<CRLF>\r\n")
			} else if(msg.startsWith("QUIT")) {
				sock.write(`221 Bye\r\n`)
				sock.end()
			} else if(msg.startsWith("VRFY")) {
				// This command is used to verify if a user exists, but that can be a security risk + it is also done with RCPT TO anyway
				sock.write(`502 Command not implemented\r\n`)
			} else if(msg.startsWith("EXPN")) {
				sock.write(`502 Command not implemented\r\n`)
			} else {
				sock.write(`500 Syntax error, command unrecognized\r\n`)
			}
		});
		sock.on("close", () => {
			logger.log("Client disconnected")
		})
	}

	async handleNewMail(info: { from: string, to: string[], content: string }) {
		const id = crypto.randomUUID()
		mkdirSync(`mails/`, { recursive: true })
		writeFileSync(`mails/${id}.txt`, info.content)
		logger.log(`Saved mail to mails/${id}.txt`)
		const serverName = getConfig("host")
		if(info.from.endsWith("@" + serverName)) {
			logger.log("Mail is from this server.")
			if(info.to.every(email => email.endsWith("@" + serverName))) { // if all recipients are on this server
				logger.log("All recipients are on this server.")
				// TODO: add mail to mailboxes
				return
			}
			logger.log("Not all recipients are on this server. Will forward mail to other servers.");
			logger.error("Forwarding mails to other servers is not implemented yet.")
			return
		}
		// Mail is not from this server
		if(!info.to.every(email => email.endsWith("@" + serverName))) {
			logger.error("Not all recipients are from this server. Will NOT forward mail to other servers.")
		}
		const recipients = info.to.filter(email => email.endsWith("@" + serverName))
		for(const rec of recipients) {
			logger.log("Forwarding mail to " + rec);
			const user = await User.findOne({ where: { username: rec.split("@")[0] } });
			if(!user) {
				logger.error("User " + rec + " does not exist.")
				continue
			}
			await user.$create("mail", {
				from: info.from,
				to: rec,
				content: id
			});
			logger.log("Forwarded mail to " + rec);
		}
	}

}
