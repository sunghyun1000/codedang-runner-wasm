package codedang.runner;

import java.io.*;
import java.lang.reflect.InvocationTargetException;
import java.net.URLClassLoader;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.jar.*;
import org.eclipse.jdt.internal.compiler.Compiler;
import org.eclipse.jdt.internal.compiler.DefaultErrorHandlingPolicies;
import org.eclipse.jdt.internal.compiler.batch.CompilationUnit;
import org.eclipse.jdt.internal.compiler.classfmt.ClassFileReader;
import org.eclipse.jdt.internal.compiler.env.ICompilationUnit;
import org.eclipse.jdt.internal.compiler.env.INameEnvironment;
import org.eclipse.jdt.internal.compiler.env.NameEnvironmentAnswer;
import org.eclipse.jdt.internal.compiler.impl.CompilerOptions;
import org.eclipse.jdt.internal.compiler.problem.DefaultProblemFactory;

/** The only application code shipped with the CheerpJ backend. */
public final class Bridge {
    private static native String readInput();
    private static native void writeOutput(byte[] bytes, int offset, int length, boolean stderr);
    private static native void compiled(byte[] jar);

    private static PrintStream stream(final boolean stderr) throws IOException {
        return new PrintStream(new OutputStream() {
            public void write(int value) { write(new byte[] { (byte) value }, 0, 1); }
            public void write(byte[] bytes, int offset, int length) {
                writeOutput(bytes, offset, length, stderr);
            }
        }, true, "UTF-8");
    }

    public static void main(String[] args) throws Exception {
        System.setOut(stream(false));
        System.setErr(stream(true));
        try {
            execute(args);
        } catch (Throwable error) {
            error.printStackTrace(System.err);
            System.exit(1);
        }
    }

    private static void execute(String[] args) throws Exception {
        if (args[0].equals("compile")) {
            if (!Compilation.compile()) System.exit(1);
            return;
        }
        System.setIn(new InputStream() {
            private byte[] bytes = new byte[0];
            private int position;
            private boolean ended;
            private boolean refill() {
                while (!ended && position == bytes.length) {
                    String text = readInput();
                    if (text == null) { ended = true; return false; }
                    bytes = text.getBytes(StandardCharsets.UTF_8);
                    position = 0;
                }
                return !ended;
            }
            public int read() { return refill() ? bytes[position++] & 255 : -1; }
            public int read(byte[] target, int offset, int length) {
                java.util.Objects.checkFromIndexSize(offset, length, target.length);
                if (length == 0) return 0;
                if (!refill()) return -1;
                int count = Math.min(length, bytes.length - position);
                System.arraycopy(bytes, position, target, offset, count);
                position += count;
                return count;
            }
            public int available() { return bytes.length - position; }
        });
        try (URLClassLoader loader = new URLClassLoader(new java.net.URL[] {
                Paths.get("/str/main.jar").toUri().toURL()
        }, Bridge.class.getClassLoader())) {
            Thread.currentThread().setContextClassLoader(loader);
            try {
                java.lang.reflect.Method main = loader.loadClass("Main").getMethod("main", String[].class);
                main.setAccessible(true);
                main.invoke(null, (Object) new String[0]);
            } catch (InvocationTargetException error) {
                error.getCause().printStackTrace(System.err);
                System.exit(1);
            }
        }
        System.out.flush();
        System.err.flush();
    }

    // Keep ECJ references out of the execution entry class: run Workers do not load ECJ.
    private static final class Compilation {
    private static boolean compile() throws Exception {
        // CheerpJ exposes class resources, but not a complete host JDK's JRT filesystem.
        INameEnvironment environment = new INameEnvironment() {
            private final Map<String, NameEnvironmentAnswer> cache = new HashMap<>();
            private String path(char[][] names) {
                StringJoiner joined = new StringJoiner("/");
                if (names != null) for (char[] name : names) joined.add(new String(name));
                return joined.toString();
            }
            private NameEnvironmentAnswer find(String name) {
                if (!cache.containsKey(name)) {
                    NameEnvironmentAnswer answer = null;
                    try (InputStream input = ClassLoader.getSystemResourceAsStream(name + ".class")) {
                        if (input != null) answer = new NameEnvironmentAnswer(
                            new ClassFileReader(input.readAllBytes(), name.toCharArray()), null);
                    } catch (Exception error) { throw new IllegalStateException("Cannot read class " + name, error); }
                    cache.put(name, answer);
                }
                return cache.get(name);
            }
            public NameEnvironmentAnswer findType(char[][] name) { return find(path(name)); }
            public NameEnvironmentAnswer findType(char[] name, char[][] parent) {
                String prefix = path(parent);
                return find(prefix.isEmpty() ? new String(name) : prefix + "/" + new String(name));
            }
            public boolean isPackage(char[][] parent, char[] name) { return findType(name, parent) == null; }
            public void cleanup() { cache.clear(); }
        };
        Map<String, String> options = new HashMap<>();
        options.put(CompilerOptions.OPTION_Source, CompilerOptions.VERSION_17);
        options.put(CompilerOptions.OPTION_Compliance, CompilerOptions.VERSION_17);
        options.put(CompilerOptions.OPTION_TargetPlatform, CompilerOptions.VERSION_17);
        Map<String, byte[]> classes = new TreeMap<>();
        boolean[] success = { true };
        Compiler compiler = new Compiler(environment, DefaultErrorHandlingPolicies.proceedWithAllProblems(), options, result -> {
            if (result.hasErrors()) {
                success[0] = false;
                for (org.eclipse.jdt.core.compiler.IProblem problem : result.getErrors()) {
                    System.err.println("Main.java:" + problem.getSourceLineNumber() + ": " + problem.getMessage());
                }
            } else {
                for (org.eclipse.jdt.internal.compiler.ClassFile file : result.getClassFiles()) {
                    classes.put(new String(file.fileName()) + ".class", file.getBytes());
                }
            }
        }, new DefaultProblemFactory(Locale.ROOT));
        try {
            compiler.compile(new ICompilationUnit[] { new CompilationUnit(
                Files.readString(Paths.get("/str/Main.java"), StandardCharsets.UTF_8).toCharArray(), "Main.java", "UTF-8") });
        } finally { environment.cleanup(); }
        if (!success[0]) return false;
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (JarOutputStream jar = new JarOutputStream(bytes)) {
            for (Map.Entry<String, byte[]> file : classes.entrySet()) {
                JarEntry entry = new JarEntry(file.getKey());
                entry.setTime(0);
                jar.putNextEntry(entry);
                jar.write(file.getValue());
                jar.closeEntry();
            }
        }
        compiled(bytes.toByteArray());
        return true;
    }
    }
}
