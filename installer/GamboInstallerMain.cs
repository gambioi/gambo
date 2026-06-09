using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace GamboInstaller
{
    class MainForm : Form
    {
        [DllImport("user32.dll")] static extern int SendMessage(IntPtr h, int m, int w, int l);
        [DllImport("user32.dll")] static extern bool ReleaseCapture();

        FlowLayoutPanel _list;
        ToggleSwitch _openAsar;
        RichTextBox _log;
        readonly List<InstallCard> _cards = new List<InstallCard>();

        public MainForm()
        {
            Text = "Gambo Installer";
            FormBorderStyle = FormBorderStyle.None;
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(600, 640);
            BackColor = C.Bg;
            Font = new Font("Segoe UI", 9f);
            DoubleBuffered = true;

            BuildTitle();
            BuildContent();
            BuildButtonsAndLog();

            Load += (s, e) => Populate();
            Resize += (s, e) => ApplyRegion();
            ApplyRegion();
        }

        void ApplyRegion()
        {
            using (var p = Draw.Round(new Rectangle(0, 0, Width, Height), 14))
                Region = new Region(p);
        }

        // ── Titlebar ────────────────────────────────────────────────────────
        void BuildTitle()
        {
            var bar = new Panel { Dock = DockStyle.Top, Height = 56, BackColor = C.Bg };
            bar.MouseDown += (s, e) => { if (e.Button == MouseButtons.Left) { ReleaseCapture(); SendMessage(Handle, 0xA1, 0x2, 0); } };

            var badge = new Panel { Width = 32, Height = 32, Left = 18, Top = 12, BackColor = C.Bg };
            badge.Paint += (s, e) =>
            {
                e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
                using (var b = new SolidBrush(C.Accent))
                using (var p = Draw.Round(new Rectangle(0, 0, 31, 31), 8)) e.Graphics.FillPath(b, p);
                TextRenderer.DrawText(e.Graphics, "G", new Font("Segoe UI", 14f, FontStyle.Bold),
                    new Rectangle(0, 0, 32, 32), Color.White, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
            };
            bar.Controls.Add(badge);

            var title = new Label { Text = "Gambo Installer", ForeColor = C.Text, Font = new Font("Segoe UI", 12f, FontStyle.Bold), AutoSize = true, Left = 60, Top = 9, BackColor = Color.Transparent };
            var sub = new Label { Text = "Discord client mod - by _o0", ForeColor = C.Sub, Font = new Font("Segoe UI", 8f), AutoSize = true, Left = 62, Top = 31, BackColor = Color.Transparent };
            bar.Controls.Add(title); bar.Controls.Add(sub);

            var close = new Label { Text = "X", ForeColor = C.Sub, Font = new Font("Segoe UI", 11f, FontStyle.Bold), Width = 46, Height = 56, TextAlign = ContentAlignment.MiddleCenter, Left = 554, Top = 0, Cursor = Cursors.Hand, BackColor = Color.Transparent };
            close.MouseEnter += (s, e) => { close.BackColor = C.Danger; close.ForeColor = Color.White; };
            close.MouseLeave += (s, e) => { close.BackColor = Color.Transparent; close.ForeColor = C.Sub; };
            close.Click += (s, e) => Close();
            bar.Controls.Add(close);

            Controls.Add(bar);
        }

        // ── Contenu (cards + custom + openasar) ───────────────────────────────
        void BuildContent()
        {
            var content = new Panel { Dock = DockStyle.Fill, BackColor = C.Bg, Padding = new Padding(18, 8, 18, 8), AutoScroll = true };

            var lbl1 = new Label { Text = "DETECTED INSTALLATIONS", ForeColor = C.Muted, Font = new Font("Segoe UI", 7.5f, FontStyle.Bold), AutoSize = true, Margin = new Padding(2, 0, 0, 6) };

            _list = new FlowLayoutPanel { FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoSize = true, Width = 546, Margin = new Padding(0) };

            var custom = new LinkLabel { Text = "+ Add custom location", AutoSize = true, LinkColor = ColorTranslator.FromHtml("#7B83EB"), ActiveLinkColor = ColorTranslator.FromHtml("#A5ABF0"), Font = new Font("Segoe UI", 9.5f), Margin = new Padding(2, 2, 0, 0), LinkBehavior = LinkBehavior.HoverUnderline };
            custom.LinkClicked += (s, e) => AddCustom();

            var lbl2 = new Label { Text = "STARTUP MODE", ForeColor = C.Muted, Font = new Font("Segoe UI", 7.5f, FontStyle.Bold), AutoSize = true, Margin = new Padding(2, 14, 0, 6) };

            var oaCard = new Panel { Width = 546, Height = 58, BackColor = C.Bg, Margin = new Padding(0) };
            oaCard.Paint += (s, e) =>
            {
                e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
                using (var b = new SolidBrush(C.Card))
                using (var p = Draw.Round(new Rectangle(0, 0, oaCard.Width - 1, oaCard.Height - 1), 10)) e.Graphics.FillPath(b, p);
            };
            var oaTitle = new Label { Text = "Fast startup (OpenAsar)", ForeColor = C.Text, Font = new Font("Segoe UI", 10.5f, FontStyle.Bold), AutoSize = true, Left = 14, Top = 9, BackColor = Color.Transparent };
            var oaDesc = new Label { Text = "Removes the 'Checking for updates' screen and speeds up launch.", ForeColor = C.Sub, Font = new Font("Segoe UI", 8f), AutoSize = true, Left = 16, Top = 31, BackColor = Color.Transparent };
            _openAsar = new ToggleSwitch { Left = 486, Top = 16 };
            oaCard.Controls.Add(oaTitle); oaCard.Controls.Add(oaDesc); oaCard.Controls.Add(_openAsar);

            var stack = new FlowLayoutPanel { Dock = DockStyle.Top, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoSize = true, Width = 546 };
            stack.Controls.Add(lbl1);
            stack.Controls.Add(_list);
            stack.Controls.Add(custom);
            stack.Controls.Add(lbl2);
            stack.Controls.Add(oaCard);
            content.Controls.Add(stack);
            Controls.Add(content);
            content.BringToFront();
        }

        // ── Boutons + log ─────────────────────────────────────────────────────
        void BuildButtonsAndLog()
        {
            var logPanel = new Panel { Dock = DockStyle.Bottom, Height = 104, BackColor = ColorTranslator.FromHtml("#0E0F12"), Padding = new Padding(18, 8, 18, 8) };
            _log = new RichTextBox { Dock = DockStyle.Fill, BackColor = ColorTranslator.FromHtml("#0E0F12"), ForeColor = C.Log, Font = new Font("Consolas", 8.5f), ReadOnly = true, BorderStyle = BorderStyle.None };
            logPanel.Controls.Add(_log);
            Controls.Add(logPanel);

            var btns = new Panel { Dock = DockStyle.Bottom, Height = 64, BackColor = C.Bg, Padding = new Padding(18, 10, 18, 12) };
            var install = new FlatBtn { Text = "INSTALL", Width = 258, Height = 42, Left = 18, Top = 10 };
            install.Click += (s, e) => DoInstall();
            var uninstall = new FlatBtn { Text = "UNINSTALL", Width = 258, Height = 42, Left = 324, Top = 10, Base = C.DangerBg, Hover = ColorTranslator.FromHtml("#4A2828"), ForeColor = C.Danger, Brd = ColorTranslator.FromHtml("#7A2E2E") };
            uninstall.Click += (s, e) => DoUninstall();
            btns.Controls.Add(install); btns.Controls.Add(uninstall);
            Controls.Add(btns);
        }

        // ── Logique UI ──────────────────────────────────────────────────────
        void Log(string msg, Color col)
        {
            _log.SelectionStart = _log.TextLength;
            _log.SelectionLength = 0;
            _log.SelectionColor = col;
            _log.AppendText(msg + "\n");
            _log.ScrollToCaret();
            Application.DoEvents();
        }

        void LogResult(string r)
        {
            if (string.IsNullOrEmpty(r)) return;
            bool err = r.StartsWith("ERR");
            Log("   " + (err ? "[ERR] " : "[OK] ") + r.Substring(err ? 3 : 2).Trim(), err ? C.Danger : C.Green);
        }

        void Populate()
        {
            Log("Gambo Installer ready.", C.Accent);
            if (!System.IO.File.Exists(Core.PatcherPath))
                Log("[!] dist/patcher.js missing - the 'dist' folder must sit next to 'installer'.", C.Danger);
            var installs = Core.Detect();
            if (installs.Count == 0)
            {
                var w = new Label { Text = "No Discord installation found on this PC.", ForeColor = C.Danger, AutoSize = true, Margin = new Padding(2, 4, 0, 4) };
                _list.Controls.Add(w);
                return;
            }
            bool anyOA = false;
            foreach (var i in installs) { AddCard(i); if (i.HasOpenAsar) anyOA = true; }
            _openAsar.Checked = anyOA;
        }

        void AddCard(InstallInfo i)
        {
            var card = new InstallCard(i) { Width = 542 };
            _cards.Add(card);
            _list.Controls.Add(card);
        }

        void AddCustom()
        {
            using (var dlg = new FolderBrowserDialog())
            {
                dlg.Description = "Pick your Discord install folder (root or app-... folder)";
                if (dlg.ShowDialog() != DialogResult.OK) return;
                var i = Core.FromPath(dlg.SelectedPath);
                if (i == null) { Log("[!] No valid Discord install found in that folder.", C.Danger); return; }
                foreach (var c in _cards) if (c.Info.Name == i.Name) { Log("[i] Already in the list.", C.Sub); return; }
                AddCard(i);
                Log("[OK] Location added: " + i.Name, C.Green);
            }
        }

        List<InstallCard> Selected()
        {
            var s = new List<InstallCard>();
            foreach (var c in _cards) if (c.Toggle.Checked) s.Add(c);
            return s;
        }

        void DoInstall()
        {
            var sel = Selected();
            if (sel.Count == 0) { Log("[!] Select at least one installation.", C.Danger); return; }
            bool oa = _openAsar.Checked;
            Log(">> Installing...", C.Accent);
            Log("   Mode: " + (oa ? "OpenAsar (fast)" : "Normal"), C.Sub);
            foreach (var c in sel)
            {
                Core.StopDiscord(c.Info.Exe);
                System.Threading.Thread.Sleep(400);
                LogResult(Core.InstallGambo(c.Info));
                LogResult(oa ? Core.InstallOpenAsar(c.Info) : Core.UninstallOpenAsar(c.Info));
                c.RefreshStatus();
            }
            Log("   Restart Discord to apply.", C.Sub);
        }

        void DoUninstall()
        {
            var sel = Selected();
            if (sel.Count == 0) { Log("[!] Select at least one installation.", C.Danger); return; }
            Log(">> Uninstalling...", C.Danger);
            foreach (var c in sel)
            {
                Core.StopDiscord(c.Info.Exe);
                System.Threading.Thread.Sleep(400);
                LogResult(Core.UninstallGambo(c.Info));
                LogResult(Core.UninstallOpenAsar(c.Info));
                c.RefreshStatus();
            }
            Log("   Restart Discord to apply.", C.Sub);
        }
    }

    static class Program
    {
        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm());
        }
    }
}
