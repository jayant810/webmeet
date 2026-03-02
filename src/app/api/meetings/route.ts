import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { roomId } = await req.json();

  try {
    const meeting = await prisma.meeting.create({
      data: {
        id: roomId,
        adminId: (session.user as any).id,
        participants: {
          create: {
            userId: (session.user as any).id,
            role: "admin",
          },
        },
      },
    });

    return NextResponse.json(meeting);
  } catch (error) {
    console.error("Error creating meeting:", error);
    return NextResponse.json({ error: "Failed to create meeting" }, { status: 500 });
  }
}
