/** Compile alongside Main.java; user source is never rewritten. */
export const javaBootstrap = `
import java.io.*;
import org.teavm.jso.JSBody;

public final class CodedangBootstrap {
    public static InputStream in;
    @JSBody(script = "return globalThis.codedangRead();")
    private static native int readInput();
    @JSBody(script = "return globalThis.codedangAvailable();")
    private static native int availableInput();
    public static void main(String[] args) throws Throwable {
        in = new InputStream() {
            public int read() { return readInput(); }
            public int available() { return availableInput(); }
            public int read(byte[] bytes, int offset, int length) {
                if (bytes == null) throw new NullPointerException();
                if (offset < 0 || length < 0 || length > bytes.length - offset)
                    throw new IndexOutOfBoundsException();
                if (length == 0) return 0;
                int value = read();
                if (value < 0) return -1;
                bytes[offset] = (byte) value;
                int count = 1;
                while (count < length && available() > 0) bytes[offset + count++] = (byte) read();
                return count;
            }
        };
        Main.main(args);
        System.out.flush();
        System.err.flush();
    }
}
`
