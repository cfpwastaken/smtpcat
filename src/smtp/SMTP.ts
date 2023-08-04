export default class SMTP {
	static async handleNewMail(info: { from: string, to: string[], content: string }) {
		console.log(info.content);
		Deno.exit(0);
	}
}