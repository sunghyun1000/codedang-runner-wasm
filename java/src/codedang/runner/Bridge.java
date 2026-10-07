package codedang.runner;

import java.io.*;
import java.lang.reflect.InvocationTargetException;
import java.net.URLClassLoader;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.jar.*;
import javax.tools.*;

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
            if (!compile()) System.exit(1);
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

    private static boolean compile() throws Exception {
        JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
        if (compiler == null) compiler = (JavaCompiler) Class.forName("com.sun.tools.javac.api.JavacTool").getConstructor().newInstance();
        final Map<String, ByteArrayOutputStream> classes = new LinkedHashMap<>();
        try (StandardJavaFileManager standard = compiler.getStandardFileManager(null, null, StandardCharsets.UTF_8)) {
            JavaFileManager manager = new ForwardingJavaFileManager<StandardJavaFileManager>(standard) {
                public JavaFileObject getJavaFileForOutput(Location location, String name,
                        JavaFileObject.Kind kind, FileObject sibling) {
                    final String path = name.replace('.', '/') + kind.extension;
                    return new SimpleJavaFileObject(java.net.URI.create("mem:///" + path), kind) {
                        public OutputStream openOutputStream() {
                            ByteArrayOutputStream output = new ByteArrayOutputStream();
                            classes.put(path, output);
                            return output;
                        }
                    };
                }
            };
            boolean success = compiler.getTask(new PrintWriter(System.err, true), manager, null,
                Arrays.asList("-encoding", "UTF-8", "-proc:none", "-source", "17", "-target", "17"),
                null, standard.getJavaFileObjects("/str/Main.java")).call();
            if (!success) return false;
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            try (JarOutputStream jar = new JarOutputStream(bytes)) {
                for (Map.Entry<String, ByteArrayOutputStream> file : classes.entrySet()) {
                    JarEntry entry = new JarEntry(file.getKey());
                    entry.setTime(0);
                    jar.putNextEntry(entry);
                    file.getValue().writeTo(jar);
                    jar.closeEntry();
                }
            }
            compiled(bytes.toByteArray());
            return true;
        }
    }
}
