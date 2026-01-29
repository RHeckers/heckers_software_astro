const nodemailer = require("nodemailer");
const { z } = require("zod");

const ContactSchema = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    phone: z.string().optional(),
    subject: z.string().optional(),
    message: z.string().min(10)
});

module.exports = async function (context, req) {
    try {
        if (req.method !== "POST") {
            context.res = { status: 405 };
            return;
        }


        const parsed = ContactSchema.safeParse(req.body);
        if (!parsed.success) {
            context.res = { status: 400, body: "Invalid input" };
            return;
        }

        // Use defaults if not provided
        const {
            name,
            email,
            phone = "Not provided",
            subject = "General",
            message
        } = parsed.data;

        const transporter = nodemailer.createTransport({
            host: "smtp.zoho.eu",
            port: 465,
            secure: true,
            auth: {
                user: process.env.ZOHO_SMTP_USER,
                pass: process.env.ZOHO_SMTP_PASS
            }
        });


        const emailText = `
            Name: ${name}
            Email: ${email}
            Phone: ${phone}
            Subject: ${subject}
            Message:
            ${message}
        `;

        await transporter.sendMail({
            from: `"Website Contact" <info@heckerssoftware.com>`,
            to: "info@heckerssoftware.com",
            replyTo: email,
            subject: `New contact form: ${subject} - ${name}`,
            text: emailText
        });

        context.res = {
            status: 200,
            body: { success: true }
        };
    } catch (err) {
        context.log.error(err);
        context.res = {
            status: 500,
            body: "Email failed"
        };
    }
};
