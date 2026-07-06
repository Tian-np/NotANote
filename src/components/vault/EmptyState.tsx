import { FileText, FolderPlus, KeyRound, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type EmptyStateVariant = "empty-vault" | "empty-folder" | "no-results";

type EmptyStateProps = {
  variant: EmptyStateVariant;
  onCreateNote: () => void;
  onCreateLogin: () => void;
  onCreateFolder?: () => void;
};

export function EmptyState({
  variant,
  onCreateNote,
  onCreateLogin,
  onCreateFolder,
}: EmptyStateProps) {
  if (variant === "no-results") {
    return (
      <Card className="border-dashed border-border/60 bg-muted/10">
        <CardContent className="flex flex-col items-center py-12 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <SearchX className="h-6 w-6" aria-hidden />
          </div>
          <p className="font-medium">ไม่พบผลที่ตรงกับการค้นหาหรือตัวกรอง</p>
          <p className="mt-1 text-sm text-muted-foreground">
            ลองเปลี่ยนคำค้นหาหรือประเภทรายการ
          </p>
        </CardContent>
      </Card>
    );
  }

  if (variant === "empty-folder") {
    return (
      <Card className="border-dashed border-border/60 bg-muted/10">
        <CardContent className="flex flex-col items-center py-12 text-center">
          <p className="font-medium">หมวดนี้ยังว่าง</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            สร้างหมวดย่อย โน้ต หรือรหัสเว็บในหมวดนี้
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {onCreateFolder ? (
              <Button type="button" variant="outline" onClick={onCreateFolder} className="gap-2">
                <FolderPlus className="h-4 w-4" aria-hidden />
                สร้างหมวดย่อย
              </Button>
            ) : null}
            <Button type="button" onClick={onCreateNote} className="gap-2">
              <FileText className="h-4 w-4" aria-hidden />
              โน้ตใหม่
            </Button>
            <Button type="button" variant="login" onClick={onCreateLogin} className="gap-2">
              <KeyRound className="h-4 w-4" aria-hidden />
              รหัสเว็บ
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-dashed border-border/60 bg-muted/10">
      <CardContent className="flex flex-col items-center py-14 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <FileText className="h-7 w-7" aria-hidden />
        </div>
        <p className="text-lg font-semibold">ยังไม่มีรายการ</p>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          เริ่มด้วยการสร้างหมวด โน้ต หรือรหัสเว็บ — ข้อมูลถูกเข้ารหัสในเบราว์เซอร์
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {onCreateFolder ? (
            <Button type="button" variant="outline" onClick={onCreateFolder} className="gap-2">
              <FolderPlus className="h-4 w-4" aria-hidden />
              สร้างหมวด
            </Button>
          ) : null}
          <Button type="button" onClick={onCreateNote} className="gap-2">
            <FileText className="h-4 w-4" aria-hidden />
            สร้างโน้ตแรก
          </Button>
          <Button type="button" variant="login" onClick={onCreateLogin} className="gap-2">
            <KeyRound className="h-4 w-4" aria-hidden />
            เพิ่มรหัสเว็บ
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
