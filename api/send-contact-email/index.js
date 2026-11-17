const nodemailer = require("nodemailer");
const { z } = require("zod");

const ContactSchema = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    phone: z.string().optional(),
    subject: z.string().optional(),
    message: z.string().min(10),
    // A requested time for a call, in Amsterdam time. Empty when none was picked.
    appointment: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
        .or(z.literal(""))
        .optional()
});

const CALL_MINUTES = 30;

/** The moment a wall-clock time in Amsterdam is, as a Date. */
function amsterdamTime(day, time) {
    const [y, m, d] = day.split("-").map(Number);
    const [hh, mm] = time.split(":").map(Number);
    const guess = Date.UTC(y, m - 1, d, hh, mm);
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat("en-GB", {
            timeZone: "Europe/Amsterdam",
            hourCycle: "h23",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
        })
            .formatToParts(new Date(guess))
            .map((part) => [part.type, part.value])
    );
    const shown = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
    return new Date(guess - (shown - guess));
}

const stamp = (date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (text) => text.replace(/[\\;,]/g, (c) => "\\" + c).replace(/\r?\n/g, "\\n");

/** A calendar file for the requested call. */
function callInvite({ start, name, email, phone, subject, message }) {
    const end = new Date(start.getTime() + CALL_MINUTES * 60000);
    return [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Heckers Software//Website//EN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        `UID:${stamp(start)}-${Date.now()}@heckerssoftware.com`,
        `DTSTAMP:${stamp(new Date())}`,
        `DTSTART:${stamp(start)}`,
        `DTEND:${stamp(end)}`,
        `SUMMARY:${icsText(`Call with ${name} (requested, to confirm)`)}`,
        `DESCRIPTION:${icsText(`${name} <${email}>\nPhone: ${phone}\nSubject: ${subject}\n\n${message}`)}`,
        "STATUS:TENTATIVE",
        "END:VEVENT",
        "END:VCALENDAR"
    ].join("\r\n");
}



const handler = async function (context, req) {
    try {
        if (req.method !== "POST") {
            context.res = { status: 405 };
            return;
        }

        // Honeypot check
        if (req.body && typeof req.body.website === "string" && req.body.website.trim() !== "") {
            context.res = { status: 200, body: { success: true } };
            return;
        }

        // Turnstile verification
        const turnstileToken = req.body?.turnstileToken;
        if (!turnstileToken) {
            context.res = { status: 400, body: "Turnstile verification required" };
            return;
        }

        const turnstileRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                secret: process.env.TURNSTILE_SECRET_KEY,
                response: turnstileToken
            })
        });
        const turnstileData = await turnstileRes.json();
        if (!turnstileData.success) {
            context.res = { status: 403, body: "Turnstile verification failed" };
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
            message,
            appointment = ""
        } = parsed.data;

        // The requested call, when a time was picked in the form.
        let call = null;
        if (appointment) {
            const [day, time] = appointment.split(" ");
            const start = amsterdamTime(day, time);
            if (!Number.isNaN(start.valueOf())) {
                const when = new Intl.DateTimeFormat("en-GB", {
                    timeZone: "Europe/Amsterdam",
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    hourCycle: "h23"
                }).format(start);
                call = { start, when };
            }
        }

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
            Requested call: ${call ? `${call.when} (Amsterdam time), ${CALL_MINUTES} minutes. Not confirmed yet: reply to confirm.` : "none"}
            Message:
            ${message}
        `;

        await transporter.sendMail({
            from: `"Website Contact" <info@heckerssoftware.com>`,
            to: "info@heckerssoftware.com",
            replyTo: email,
            subject: call
                ? `Call request: ${call.when} - ${name}`
                : `New contact form: ${subject} - ${name}`,
            text: emailText,
            // Opens as an event in a mail client, to add to the calendar.
            ...(call && {
                icalEvent: {
                    filename: "call-request.ics",
                    method: "PUBLISH",
                    content: callInvite({ start: call.start, name, email, phone, subject, message })
                }
            })
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

module.exports = Object.assign(handler, { amsterdamTime, callInvite });
