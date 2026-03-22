import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const meeting = await prisma.meeting.findUnique({
      where: { id },
      select: { 
        adminId: true,
        title: true,
        invitedEmails: true
      },
    });

    if (!meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    return NextResponse.json(meeting);
  } catch (error) {
    console.error("Error fetching meeting:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession();
  
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { emailToInvite } = body;

    if (!emailToInvite) {
       return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const meeting = await prisma.meeting.findUnique({
       where: { id },
       select: { adminId: true, invitedEmails: true, admin: { select: { email: true } } }
    });

    if (!meeting) {
       return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    // Check if requester is admin
    if (meeting.admin.email !== session.user.email) {
       return NextResponse.json({ error: "Forbidden: Only host can invite" }, { status: 403 });
    }

    const updatedMeeting = await prisma.meeting.update({
       where: { id },
       data: {
          invitedEmails: {
             push: emailToInvite
          }
       },
       select: { invitedEmails: true }
    });

    return NextResponse.json(updatedMeeting);
  } catch (error) {
    console.error("Error updating meeting:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
