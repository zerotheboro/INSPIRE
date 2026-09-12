import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import nodemailer from "nodemailer";
export { inspireAI } from "./inspireAI";

initializeApp();

const EMAIL_USER = defineSecret("EMAIL_USER");
const EMAIL_PASS = defineSecret("EMAIL_PASS");

export const submitBooking = onCall(
  {
    region: "asia-southeast1",
    secrets: [EMAIL_USER, EMAIL_PASS],
    cors: true,
    invoker: "public",
  },

  async (request) => {
    const data = request.data;

    // Basic validation
    if (
      !data ||
      typeof data.name !== "string" ||
      typeof data.phone !== "string" ||
      typeof data.service !== "string" ||
      !data.name.trim() ||
      !data.phone.trim() ||
      !data.service.trim()
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Thông tin đặt lịch không hợp lệ."
      );
    }

    const booking = {
      name: data.name.trim(),
      phone: data.phone.trim(),
      email:
        typeof data.email === "string"
          ? data.email.trim()
          : "",

      service: data.service.trim(),

      preferredDate:
        typeof data.preferredDate === "string"
          ? data.preferredDate
          : "",

      preferredTime:
        typeof data.preferredTime === "string"
          ? data.preferredTime
          : "",

      note:
        typeof data.note === "string"
          ? data.note.trim()
          : "",

      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
    };

    // Save booking to Firestore
    const docRef = await getFirestore()
      .collection("counselingBookings")
      .add(booking);

    // Send email notification
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: EMAIL_USER.value(),
        pass: EMAIL_PASS.value(),
      },
    });

   try {
  await transporter.sendMail({
    from: `"INSPIRE Booking" <${EMAIL_USER.value()}>`,
    to: [
      EMAIL_USER.value(),
      "dieutritamlyinspire@gmail.com",
    ],
    subject: "Có yêu cầu đặt lịch mới tại INSPIRE",
    text: `
    CÓ YÊU CẦU ĐẶT LỊCH MỚI

    Họ và tên: ${booking.name}
    Số điện thoại: ${booking.phone}
    Email: ${booking.email || "Không có"}

    Dịch vụ: ${booking.service}

    Ngày mong muốn:
    ${booking.preferredDate || "Chưa chọn"}

    Giờ mong muốn:
    ${booking.preferredTime || "Chưa chọn"}

    Ghi chú:
    ${booking.note || "Không có"}

    Mã đặt lịch:
    ${docRef.id}
        `,
    });

    console.log("EMAIL_SENT");
    } catch (error) {
    console.error("EMAIL_SEND_ERROR", error);
    }
    return {
      success: true,
      bookingId: docRef.id,
    };
  }
);
