import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";

export interface CounselingBooking {
  name: string;
  phone: string;
  email: string;
  service: string;
  preferredDate?: string;
  preferredTime?: string;
  note?: string;
}

export async function submitCounselingBooking(
  booking: CounselingBooking
) {
  const submitBooking = httpsCallable<
    CounselingBooking,
    {
      success: boolean;
      bookingId: string;
    }
  >(functions, "submitBooking");

  const result = await submitBooking(booking);

  return result.data.bookingId;
}
