// IdeHost — runs inside the .NET (Mono) WebAssembly runtime.
// Loads the Roslyn compiler from the virtual filesystem, compiles the
// user's C# source, executes it, and returns captured stdout/errors.
// Invoked from JavaScript via [JSExport] after dotnet.create().
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices.JavaScript;
using System.Runtime.Loader;
using System.Threading.Tasks;
using System.Text;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.Emit;

public partial class IdeHost
{
    private static bool _ready;

    private static void EnsureReady()
    {
        if (_ready) return;
        // Make every framework + Roslyn assembly on the VFS resolvable at runtime.
        // VFS files live at "/<Name>.dll" (loader "resource" assets).
        var dir = "/";
        string[] files;
        try { files = Directory.GetFiles(dir, "*.dll"); }
        catch { files = new string[0]; }
        var loaded = new HashSet<string>();
        foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
        {
            var n = asm.GetName().Name;
            if (n != null) loaded.Add(n);
        }
        foreach (var f in files)
        {
            var name = Path.GetFileNameWithoutExtension(f);
            if (loaded.Contains(name)) continue;
            try { AssemblyLoadContext.Default.LoadFromAssemblyPath(f); loaded.Add(name); }
            catch { /* optional assembly — skip */ }
        }
        // Reload Roslyn if it was already loaded before this method ran
        // (first call orders can vary) — ensure both Roslyn assemblies are in.
        foreach (var f in files)
        {
            var name = Path.GetFileNameWithoutExtension(f);
            if (name == "Microsoft.CodeAnalysis" || name == "Microsoft.CodeAnalysis.CSharp")
            {
                if (!loaded.Contains(name))
                {
                    try { AssemblyLoadContext.Default.LoadFromAssemblyPath(f); loaded.Add(name); }
                    catch { }
                }
            }
        }
        _ready = true;
    }

    private static List<MetadataReference> BuildReferences()
    {
        var refs = new List<MetadataReference>();
        var seen = new HashSet<string>();
        // The loader writes every assembly to the VFS under its name; prefer
        // explicit locations, then probe the VFS root.
        foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
        {
            if (asm.IsDynamic) continue;
            var n = asm.GetName().Name;
            if (string.IsNullOrEmpty(n) || seen.Contains(n)) continue;
            seen.Add(n);
            string path = null;
            try { if (!string.IsNullOrEmpty(asm.Location)) path = asm.Location; } catch { }
            if (path == null) path = "/" + n + ".dll";
            try
            {
                if (File.Exists(path)) refs.Add(MetadataReference.CreateFromFile(path));
                else if (File.Exists("/" + n + ".dll")) refs.Add(MetadataReference.CreateFromFile("/" + n + ".dll"));
            }
            catch { }
        }
        string[] files;
        try { files = Directory.GetFiles("/", "*.dll"); }
        catch { files = new string[0]; }
        foreach (var f in files)
        {
            var n2 = Path.GetFileNameWithoutExtension(f);
            if (seen.Contains(n2)) continue;
            seen.Add(n2);
            try { refs.Add(MetadataReference.CreateFromFile(f)); }
            catch { }
        }
        if (refs.Count == 0)
        {
            // last resort: dump what the runtime reports for diagnostics
            try { Console.Error.WriteLine("IDE: no reference assemblies found; loaded=" + string.Join(",", AppDomain.CurrentDomain.GetAssemblies().Select(a => a.GetName().Name))); } catch { }
        }
        return refs;
    }

    [JSExport]
    public static string CompileAndRun(string source)
    {
        var result = new HostResult();
        try
        {
            EnsureReady();
            var originalOut = Console.Out;
            var originalErr = Console.Error;
            try
            {
                var sw = new StringWriter();
                Console.SetOut(sw);
                Console.SetError(sw);

                var tree = CSharpSyntaxTree.ParseText(source, new CSharpParseOptions(LanguageVersion.Preview));
                var refs = BuildReferences();
                var compilation = CSharpCompilation.Create(
                    "UserProgram",
                    new[] { tree },
                    refs,
                    new CSharpCompilationOptions(
                        OutputKind.ConsoleApplication,
                        optimizationLevel: OptimizationLevel.Release,
                        allowUnsafe: true,
                        concurrentBuild: false));

                using (var ms = new MemoryStream())
                {
                    var emit = compilation.Emit(ms);
                    if (!emit.Success)
                    {
                        foreach (var d in emit.Diagnostics.Where(d => d.Severity == DiagnosticSeverity.Error))
                            result.Errors.Add(d.Id + ": " + d.GetMessage());
                        var refNames = string.Join(",", refs.Select(r => r.Display));
                        result.Errors.Add("IDE: refs(" + refs.Count + ")=" + (refNames.Length > 300 ? refNames.Substring(0, 300) : refNames));
                        return result.ToJson();
                    }
                    ms.Position = 0;
                    var userAsm = Assembly.Load(ms.ToArray());
                    var entry = userAsm.EntryPoint;
                    if (entry == null)
                    {
                        result.Errors.Add("CS5001: Program does not contain a static 'Main' method suitable for an entry point");
                        return result.ToJson();
                    }
                    var args = entry.GetParameters().Length > 0 ? new object[] { new string[0] } : null;
                    entry.Invoke(null, args);
                }
                result.Output = sw.ToString();
                return result.ToJson();
            }
            finally
            {
                Console.SetOut(originalOut);
                Console.SetError(originalErr);
            }
        }
        catch (TargetInvocationException tie)
        {
            result.Errors.Add("Unhandled exception: " + (tie.InnerException ?? tie));
            return result.ToJson();
        }
        catch (Exception ex)
        {
            result.Errors.Add("IDE runtime error: " + ex);
            return result.ToJson();
        }
    }

    private sealed class HostResult
    {
        public string Output = "";
        public System.Collections.Generic.List<string> Errors = new System.Collections.Generic.List<string>();

        public string ToJson()
        {
            return "{\"out\":" + JsonString(Output) + ",\"err\":" + JsonString(string.Join("\n", Errors)) + "}";
        }

        private static string JsonString(string s)
        {
            var sb = new StringBuilder("\"");
            foreach (var c in s ?? "")
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4"));
                        else sb.Append(c);
                        break;
                }
            }
            return sb.Append('"').ToString();
        }
    }
}
