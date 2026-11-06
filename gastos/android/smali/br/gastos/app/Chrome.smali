.class public Lbr/gastos/app/Chrome;
.super Landroid/webkit/WebChromeClient;

.field private a:Lbr/gastos/app/MainActivity;

.method public constructor <init>(Lbr/gastos/app/MainActivity;)V
    .registers 2
    invoke-direct {p0}, Landroid/webkit/WebChromeClient;-><init>()V
    iput-object p1, p0, Lbr/gastos/app/Chrome;->a:Lbr/gastos/app/MainActivity;
    return-void
.end method

.method public onShowFileChooser(Landroid/webkit/WebView;Landroid/webkit/ValueCallback;Landroid/webkit/WebChromeClient$FileChooserParams;)Z
    .registers 7
    iget-object v0, p0, Lbr/gastos/app/Chrome;->a:Lbr/gastos/app/MainActivity;
    iput-object p2, v0, Lbr/gastos/app/MainActivity;->cb:Landroid/webkit/ValueCallback;
    new-instance v1, Landroid/content/Intent;
    const-string v2, "android.intent.action.GET_CONTENT"
    invoke-direct {v1, v2}, Landroid/content/Intent;-><init>(Ljava/lang/String;)V
    const-string v2, "android.intent.category.OPENABLE"
    invoke-virtual {v1, v2}, Landroid/content/Intent;->addCategory(Ljava/lang/String;)Landroid/content/Intent;
    const-string v2, "*/*"
    invoke-virtual {v1, v2}, Landroid/content/Intent;->setType(Ljava/lang/String;)Landroid/content/Intent;
    const/4 v2, 0x1
    invoke-virtual {v0, v1, v2}, Landroid/app/Activity;->startActivityForResult(Landroid/content/Intent;I)V
    return v2
.end method
