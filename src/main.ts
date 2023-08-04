import SMTPServer from "./smtp/SMTPServer.ts"
import getConfig from "./config.ts";

// await sql.sync({ alter: true })

// await User.create({
// 	name: "Cfp",
// 	username: "cfp",
// 	password: "1234"
// })

new SMTPServer(getConfig("smtp.port", 25), false)