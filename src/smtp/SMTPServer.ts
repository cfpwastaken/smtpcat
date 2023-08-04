import getConfig from "../config.ts"
import sendStatus from "./status.ts"
import SMTP from "./SMTP.ts"

export default class SMTPServer {

	server: Deno.Listener;

	constructor(port: number, useTLS: boolean) {
		this.server = Deno.listen({ port })
		this.listen();
	}

	async listen() {
		for await (const conn of this.server) {
			this.connection(conn);
		}
	}

	async connection(sock: Deno.Conn) {
		const status = sendStatus(sock)

		status(220, { message: getConfig("smtp.header", "SMTP Server ready") })
		let receivingData = false
		let info = {
			from: "",
			to: [] as string[],
			content: ""
		}

		const buf = new Uint8Array(1024);
		try {
			while(true) {
				const n = await sock.read(buf);
				if(n == null) {
					// Closed
					break;
				}
				const data = buf.slice(0, n);
				console.log(data);
				
				const msg = new TextDecoder().decode(data);
				console.log(msg);
				
				
				if(receivingData) {
					info.content += msg
					if(msg.endsWith(".\r\n")) {
						receivingData = false;
						info.content = info.content.substring(0, info.content.length - 3).replaceAll("\r\n", "\n")
						await SMTP.handleNewMail(info)
						status(250)
						return
					}
					return
				}
				if(msg.startsWith("EHLO")) {
					// sock.write(`250-${getConfig("host", "localhost")}\r\n`)
					sock.write(new TextEncoder().encode(`250-${getConfig("host", "localhost")}\r\n`))
					// We dont have any smtp extensions yet
					status(250, {message: "HELP"}) // was: 250 HELP
				} else if(msg.startsWith("MAIL FROM:")) {
					// The spec says we should reset the state if the client sends MAIL FROM again
					info = {
						from: "",
						to: [],
						content: ""
					}
					const email = msg.split(":")[1].split(">")[0].replace("<", "")
					info.from = email
					status(250)
				} else if(msg.startsWith("RCPT TO:")) {
					if(info.from == "") {
						// The spec says we should return 503 if the client has not sent MAIL FROM yet
						status(503)
						return
					}
					const email = msg.split(":")[1].split(">")[0].replace("<", "")
					info.to.push(email)
					status(250)
				} else if(msg.startsWith("DATA")) {
					// The spec says we should return either 503 or 554 if the client has not sent MAIL FROM or RCPT TO yet
					// We will send 554 because it is more specific
					if(info.from == "" || info.to.length == 0) {
						status(554, {message: "No valid recipients"})
						return
					}
					receivingData = true;
					status(354)
				} else if(msg.startsWith("QUIT")) {
					status(221, "2.0.0")
					sock.close();
				} else if(msg.startsWith("VRFY")) {
					// This command is used to verify if a user exists, but that can be a security risk + it is also done with RCPT TO anyway
					status(502)
				} else if(msg.startsWith("EXPN")) {
					status(502)
				} else {
					status(502)
				}
			}
		} catch(e) {
			console.error(e)
			status(500)
		}
	}

}
