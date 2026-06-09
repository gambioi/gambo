using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace GamboInstaller
{
    // ─────────────────────────────────────────────────────────────────────────
    //  Palette
    // ─────────────────────────────────────────────────────────────────────────
    static class C
    {
        public static Color Bg       = ColorTranslator.FromHtml("#16171B");
        public static Color Card     = ColorTranslator.FromHtml("#1E1F25");
        public static Color CardHov  = ColorTranslator.FromHtml("#26272D");
        public static Color Border   = ColorTranslator.FromHtml("#2B2D31");
        public static Color Accent   = ColorTranslator.FromHtml("#5865F2");
        public static Color Accent2  = ColorTranslator.FromHtml("#4752C4");
        public static Color Track    = ColorTranslator.FromHtml("#3A3C43");
        public static Color Text     = ColorTranslator.FromHtml("#F2F3F5");
        public static Color Sub      = ColorTranslator.FromHtml("#949BA4");
        public static Color Muted    = ColorTranslator.FromHtml("#5C6069");
        public static Color Green    = ColorTranslator.FromHtml("#5ED98A");
        public static Color GreenBg  = ColorTranslator.FromHtml("#1E3A28");
        public static Color Danger   = ColorTranslator.FromHtml("#F2555A");
        public static Color DangerBg = ColorTranslator.FromHtml("#3A2222");
        public static Color Log      = ColorTranslator.FromHtml("#B5BAC1");
    }

    static class Draw
    {
        public static GraphicsPath Round(Rectangle r, int radius)
        {
            int d = radius * 2;
            var p = new GraphicsPath();
            p.AddArc(r.X, r.Y, d, d, 180, 90);
            p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
            p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
            p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
            p.CloseFigure();
            return p;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Toggle switch (animé)
    // ─────────────────────────────────────────────────────────────────────────
    class ToggleSwitch : Control
    {
        bool _on;
        float _pos;
        readonly Timer _t;
        public event EventHandler CheckedChanged;

        public bool Checked
        {
            get { return _on; }
            set { _on = value; _pos = value ? 1f : 0f; Invalidate(); }
        }

        public ToggleSwitch()
        {
            Width = 46; Height = 26; Cursor = Cursors.Hand;
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint |
                     ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
            _t = new Timer { Interval = 15 };
            _t.Tick += (s, e) =>
            {
                float target = _on ? 1f : 0f;
                _pos += (target - _pos) * 0.35f;
                if (Math.Abs(target - _pos) < 0.01f) { _pos = target; _t.Stop(); }
                Invalidate();
            };
        }

        protected override void OnClick(EventArgs e)
        {
            _on = !_on; _t.Start();
            if (CheckedChanged != null) CheckedChanged(this, EventArgs.Empty);
            base.OnClick(e);
        }

        static Color Lerp(Color a, Color b, float t)
        {
            return Color.FromArgb(
                (int)(a.R + (b.R - a.R) * t),
                (int)(a.G + (b.G - a.G) * t),
                (int)(a.B + (b.B - a.B) * t));
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            using (var b = new SolidBrush(Lerp(C.Track, C.Accent, _pos)))
            using (var path = Draw.Round(new Rectangle(0, 0, Width - 1, Height - 1), Height / 2))
                g.FillPath(b, path);
            int knob = Height - 8;
            int x = (int)(4 + _pos * (Width - knob - 8));
            using (var b = new SolidBrush(Color.White))
                g.FillEllipse(b, x, 4, knob, knob);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Modele d'installation
    // ─────────────────────────────────────────────────────────────────────────
    class InstallInfo
    {
        public string Name, Exe, CoreDir, IdxPath, OrigIdx, AsarPath, AsarBackup, ExePath, AppVer;
        public bool IsInstalled { get { return File.Exists(OrigIdx); } }
        public bool HasOpenAsar { get { return File.Exists(AsarBackup); } }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Logique
    // ─────────────────────────────────────────────────────────────────────────
    static class Core
    {
        public static string ExeDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
        public static string PatcherPath = Path.GetFullPath(Path.Combine(ExeDir, "..", "dist", "patcher.js"));
        public static string OpenAsarBundle = Path.Combine(ExeDir, "openasar.asar");

        static readonly string[][] Variants = {
            new[]{ "Discord Stable", "Discord",            "Discord.exe" },
            new[]{ "Discord PTB",    "DiscordPTB",         "DiscordPTB.exe" },
            new[]{ "Discord Canary", "DiscordCanary",      "DiscordCanary.exe" },
            new[]{ "Discord Dev",    "DiscordDevelopment", "DiscordDevelopment.exe" },
        };

        static string Local { get { return Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData); } }

        static string GetCoreDir(string appDir)
        {
            string mod = Path.Combine(appDir, "modules");
            if (!Directory.Exists(mod)) return null;
            string best = null;
            foreach (var d in Directory.GetDirectories(mod, "discord_desktop_core-*"))
                if (best == null || string.CompareOrdinal(d, best) > 0) best = d;
            if (best == null) return null;
            string inner = Path.Combine(best, "discord_desktop_core");
            return Directory.Exists(inner) ? inner : null;
        }

        static string LatestAppDir(string baseDir)
        {
            if (!Directory.Exists(baseDir)) return null;
            string best = null;
            foreach (var d in Directory.GetDirectories(baseDir, "app-*"))
                if (best == null || string.CompareOrdinal(d, best) > 0) best = d;
            return best;
        }

        public static List<InstallInfo> Detect()
        {
            var list = new List<InstallInfo>();
            foreach (var v in Variants)
            {
                string appDir = LatestAppDir(Path.Combine(Local, v[1]));
                if (appDir == null) continue;
                string core = GetCoreDir(appDir);
                if (core == null) continue;
                list.Add(MakeInfo(v[0], v[2], appDir, core));
            }
            return list;
        }

        static InstallInfo MakeInfo(string name, string exe, string appDir, string core)
        {
            return new InstallInfo
            {
                Name = name, Exe = exe, CoreDir = core,
                IdxPath = Path.Combine(core, "index.js"),
                OrigIdx = Path.Combine(core, "_index.js"),
                AsarPath = Path.Combine(appDir, "resources", "app.asar"),
                AsarBackup = Path.Combine(appDir, "resources", "app.asar.backup"),
                ExePath = Path.Combine(appDir, exe),
                AppVer = Path.GetFileName(appDir).Replace("app-", "")
            };
        }

        public static InstallInfo FromPath(string path)
        {
            if (!Directory.Exists(path)) return null;
            string appDir = Path.GetFileName(path).StartsWith("app-") ? path : LatestAppDir(path);
            if (appDir == null) return null;
            string core = GetCoreDir(appDir);
            if (core == null) return null;
            string exe = "Discord.exe";
            foreach (var f in Directory.GetFiles(appDir, "*.exe"))
                if (Path.GetFileName(f).IndexOf("Discord", StringComparison.OrdinalIgnoreCase) >= 0) { exe = Path.GetFileName(f); break; }
            return MakeInfo("Custom - " + Path.GetFileName(appDir), exe, appDir, core);
        }

        public static Icon GetIcon(string exePath)
        {
            try { return File.Exists(exePath) ? Icon.ExtractAssociatedIcon(exePath) : null; }
            catch { return null; }
        }

        public static void StopDiscord(string exe)
        {
            try
            {
                string n = exe.Replace(".exe", "");
                foreach (var p in Process.GetProcessesByName(n))
                    try { p.Kill(); } catch { }
            }
            catch { }
        }

        public static string InstallGambo(InstallInfo i)
        {
            if (!File.Exists(PatcherPath)) return "ERR dist/patcher.js not found";
            try
            {
                if (!File.Exists(i.OrigIdx)) File.Copy(i.IdxPath, i.OrigIdx, true);
                string unix = PatcherPath.Replace("\\", "/");
                File.WriteAllText(i.IdxPath, "require(\"" + unix + "\");\nmodule.exports = require('./core.asar');\n");
                return "OK Gambo installed - " + i.Name + " v" + i.AppVer;
            }
            catch (Exception e) { return "ERR " + e.Message; }
        }

        public static string UninstallGambo(InstallInfo i)
        {
            try
            {
                if (!File.Exists(i.OrigIdx)) return "ERR not installed - " + i.Name;
                File.Copy(i.OrigIdx, i.IdxPath, true);
                File.Delete(i.OrigIdx);
                return "OK Gambo uninstalled - " + i.Name;
            }
            catch (Exception e) { return "ERR " + e.Message; }
        }

        static void ClearReadOnly(string p)
        {
            try { var a = File.GetAttributes(p); if ((a & FileAttributes.ReadOnly) != 0) File.SetAttributes(p, a & ~FileAttributes.ReadOnly); }
            catch { }
        }

        public static string InstallOpenAsar(InstallInfo i)
        {
            try
            {
                if (!File.Exists(OpenAsarBundle)) return "ERR openasar.asar missing";
                if (!File.Exists(i.AsarPath)) return "ERR app.asar not found";
                if (!File.Exists(i.AsarBackup)) File.Copy(i.AsarPath, i.AsarBackup, true);
                ClearReadOnly(i.AsarPath);
                File.Copy(OpenAsarBundle, i.AsarPath, true);
                return "OK OpenAsar enabled (fast startup) - " + i.Name;
            }
            catch (Exception e) { return "ERR " + e.Message; }
        }

        public static string UninstallOpenAsar(InstallInfo i)
        {
            try
            {
                if (!File.Exists(i.AsarBackup)) return "";
                ClearReadOnly(i.AsarPath);
                File.Copy(i.AsarBackup, i.AsarPath, true);
                File.Delete(i.AsarBackup);
                return "OK Normal startup restored - " + i.Name;
            }
            catch (Exception e) { return "ERR " + e.Message; }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Carte d'installation (avec hover anim)
    // ─────────────────────────────────────────────────────────────────────────
    class InstallCard : Panel
    {
        public InstallInfo Info;
        public ToggleSwitch Toggle;
        Label _pillTxt;
        Panel _pill;
        float _hover;
        readonly Timer _t;
        bool _hovering;

        public InstallCard(InstallInfo info)
        {
            Info = info;
            Height = 58; Margin = new Padding(0, 0, 0, 8);
            BackColor = C.Bg;
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint |
                     ControlStyles.OptimizedDoubleBuffer, true);

            Toggle = new ToggleSwitch { Checked = true, Left = 14, Top = 16 };
            Controls.Add(Toggle);

            Icon ico = Core.GetIcon(info.ExePath);
            if (ico != null)
            {
                var pic = new PictureBox
                {
                    Image = ico.ToBitmap(), SizeMode = PictureBoxSizeMode.Zoom,
                    Width = 28, Height = 28, Left = 72, Top = 15, BackColor = Color.Transparent
                };
                Controls.Add(pic);
            }

            var name = new Label
            {
                Text = info.Name, ForeColor = C.Text, Font = new Font("Segoe UI", 10.5f, FontStyle.Bold),
                AutoSize = true, Left = 110, Top = 11, BackColor = Color.Transparent
            };
            Controls.Add(name);
            var ver = new Label
            {
                Text = "v" + info.AppVer, ForeColor = C.Muted, Font = new Font("Segoe UI", 8f),
                AutoSize = true, Left = 112, Top = 32, BackColor = Color.Transparent
            };
            Controls.Add(ver);

            _pill = new Panel { Width = 150, Height = 22, Top = 18 };
            _pillTxt = new Label { Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleCenter,
                Font = new Font("Segoe UI", 7.5f, FontStyle.Bold) };
            _pill.Controls.Add(_pillTxt);
            _pill.Paint += (s, e) =>
            {
                e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
                using (var b = new SolidBrush(_pill.BackColor))
                using (var p = Draw.Round(new Rectangle(0, 0, _pill.Width - 1, _pill.Height - 1), 6))
                    e.Graphics.FillPath(b, p);
            };
            Controls.Add(_pill);
            RefreshStatus();

            _t = new Timer { Interval = 15 };
            _t.Tick += (s, e) =>
            {
                float target = _hovering ? 1f : 0f;
                _hover += (target - _hover) * 0.3f;
                if (Math.Abs(target - _hover) < 0.01f) { _hover = target; _t.Stop(); }
                Invalidate();
            };
            MouseEnter += (s, e) => { _hovering = true; _t.Start(); };
            MouseLeave += (s, e) => { _hovering = false; _t.Start(); };
            foreach (Control c in Controls) { c.MouseEnter += (s, e) => { _hovering = true; _t.Start(); }; }
        }

        public void RefreshStatus()
        {
            if (Info.IsInstalled)
            {
                _pill.BackColor = C.GreenBg; _pillTxt.ForeColor = C.Green;
                _pillTxt.Text = Info.HasOpenAsar ? "INSTALLED + OPENASAR" : "INSTALLED";
            }
            else { _pill.BackColor = C.Border; _pillTxt.ForeColor = C.Sub; _pillTxt.Text = "NOT INSTALLED"; }
        }

        protected override void OnSizeChanged(EventArgs e)
        {
            base.OnSizeChanged(e);
            _pill.Left = Width - _pill.Width - 12;
        }

        static Color Lerp(Color a, Color b, float t)
        {
            return Color.FromArgb((int)(a.R + (b.R - a.R) * t), (int)(a.G + (b.G - a.G) * t), (int)(a.B + (b.B - a.B) * t));
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics; g.SmoothingMode = SmoothingMode.AntiAlias;
            using (var b = new SolidBrush(Lerp(C.Card, C.CardHov, _hover)))
            using (var p = Draw.Round(new Rectangle(0, 0, Width - 1, Height - 1), 10))
                g.FillPath(b, p);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Bouton plat arrondi
    // ─────────────────────────────────────────────────────────────────────────
    class FlatBtn : Button
    {
        public Color Base = C.Accent, Hover = C.Accent2, Brd = Color.Transparent;
        bool _h;
        public FlatBtn()
        {
            FlatStyle = FlatStyle.Flat; FlatAppearance.BorderSize = 0;
            ForeColor = Color.White; Font = new Font("Segoe UI", 10f, FontStyle.Bold);
            Cursor = Cursors.Hand; BackColor = C.Bg;
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer, true);
            MouseEnter += (s, e) => { _h = true; Invalidate(); };
            MouseLeave += (s, e) => { _h = false; Invalidate(); };
        }
        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics; g.SmoothingMode = SmoothingMode.AntiAlias;
            g.Clear(Parent.BackColor);
            using (var b = new SolidBrush(_h ? Hover : Base))
            using (var p = Draw.Round(new Rectangle(0, 0, Width - 1, Height - 1), 8))
            {
                g.FillPath(b, p);
                if (Brd != Color.Transparent) using (var pen = new Pen(Brd, 1)) g.DrawPath(pen, p);
            }
            TextRenderer.DrawText(g, Text, Font, ClientRectangle, ForeColor,
                TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
        }
    }
}
