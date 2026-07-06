import { FileText, KeyRound, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type AddEntryFabProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateNote: () => void;
  onCreateLogin: () => void;
};

export function AddEntryFab({
  open,
  onOpenChange,
  onCreateNote,
  onCreateLogin,
}: AddEntryFabProps) {
  const handleNote = () => {
    onOpenChange(false);
    onCreateNote();
  };

  const handleLogin = () => {
    onOpenChange(false);
    onCreateLogin();
  };

  return (
    <>
      <Button
        type="button"
        size="icon"
        className="fixed bottom-6 right-4 z-40 h-14 w-14 rounded-full shadow-lg md:hidden"
        aria-label="เพิ่มรายการใหม่"
        onClick={() => onOpenChange(true)}
      >
        <Plus className="h-6 w-6" aria-hidden />
      </Button>

      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl border-border/80 p-0 md:hidden"
        >
          <div className="flex justify-center pt-3">
            <div className="h-1.5 w-12 rounded-full bg-muted" />
          </div>
          <SheetHeader className="border-b border-border/60 px-4 pb-3 pt-2 text-left">
            <SheetTitle>เพิ่มรายการใหม่</SheetTitle>
            <SheetDescription className="sr-only">
              เลือกประเภทรายการที่ต้องการสร้าง
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Button
              type="button"
              className="h-12 justify-start gap-3 text-base"
              onClick={handleNote}
            >
              <FileText className="h-5 w-5" aria-hidden />
              <span className="flex flex-col items-start leading-tight">
                <span>โน้ตใหม่</span>
                <span className="text-xs font-normal opacity-80">เขียนข้อความ</span>
              </span>
            </Button>
            <Button
              type="button"
              variant="login"
              className="h-12 justify-start gap-3 text-base"
              onClick={handleLogin}
            >
              <KeyRound className="h-5 w-5" aria-hidden />
              <span className="flex flex-col items-start leading-tight">
                <span>รหัสเว็บ</span>
                <span className="text-xs font-normal opacity-80">URL · ชื่อ · พาสเวิร์ด</span>
              </span>
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
